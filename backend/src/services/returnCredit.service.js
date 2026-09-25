const Order = require('../models/order.model');
const OrderItem = require('../models/orderItem.model');
const LedgerEntry = require('../models/ledgerEntry.model');
const { ApiError } = require('../utils/ApiError');
const { platformCompensationOf } = require('./discountCode.service');

// Money-Flow V2. What an approved return is worth.
//
// V1 had no answer to this at all: approving a return created a zero-priced
// replacement order and moved no money, so a pharmacy that handed goods back
// kept the full bill. V2 credits the account instead - and the number has to
// be deterministic, explainable on a statement, and derived ONLY from figures
// frozen on the original order.
//
// The invariant that drives the formula: crediting every unit of an order back
// must sum to exactly that order's finalPrice. That is only achievable by
// starting from what each line ACTUALLY contributed to the order subtotal
// (discountPrice x quantity) and then removing the same proportion of the
// order-level reductions that this slice represents.
//
// Offer and manufacturer discounts need no separate handling - they are
// already baked into discountPrice. Commission is NOT deducted: the pharmacy
// is credited what it was charged, and the warehouse's commission clawback is
// a separate concern in the settlement report.
//
// A discount code is the third order-level reduction, next to the platform
// and package discounts: a partial return credits the pharmacy only its NET
// share of the returned goods - what it actually paid for them after the code.
// Crediting the gross would let a pharmacy buy big with a large fixed code,
// return most of it, and be credited more than it ever paid. The code's use is
// NOT handed back on a partial return (the code was used on the goods kept);
// a full return hands it back (warehouseReturn.service.js).
//
// On an ADMIN code the platform owes the warehouse the code discount
// (settlement.service.js). A return undoes the same share of that
// compensation - `compensationClawbackSyp`, frozen here with the rest of the
// working so the settlement report never recomputes it - and a full return
// undoes all of it.

function round2(amount) {
  return Math.round(amount * 100) / 100;
}

// Sums the credits already issued against an order. Today the schema allows
// only one return per order, so this is always 0 - but the formula is written
// to stay correct if that rule is ever relaxed, and it costs one indexed read.
async function priorCreditsForOrder(orderId, session = null) {
  const { creditsSyp } = await priorReturnsForOrder(orderId, session);
  return creditsSyp;
}

// The credits AND the compensation clawbacks already frozen against an order.
async function priorReturnsForOrder(orderId, session = null) {
  const query = LedgerEntry.find({ kind: 'return_credit', 'metadata.orderId': orderId }).select(
    'amountSyp metadata.compensationClawbackSyp'
  );
  if (session) query.session(session);
  const entries = await query.lean();
  return {
    creditsSyp: entries.reduce((sum, entry) => sum + entry.amountSyp, 0),
    compensationClawbackSyp: entries.reduce(
      (sum, entry) => sum + (entry.metadata?.compensationClawbackSyp ?? 0),
      0
    ),
  };
}

// The valuation itself, as a pure function of frozen values - no database, no
// live prices, no current exchange rate. Exported so it can be unit-tested
// directly and so the "preview" endpoint and the approval path can never
// disagree about the number.
function computeCredit({
  order,
  orderItems,
  returnItems,
  priorCreditsSyp = 0,
  priorCompensationClawbackSyp = 0,
}) {
  const itemById = new Map(orderItems.map((item) => [String(item._id), item]));

  let returnedGrossSyp = 0;
  const lines = [];

  for (const returnItem of returnItems) {
    const orderItem = itemById.get(String(returnItem.orderItemId));
    if (!orderItem) {
      throw ApiError.badRequest(
        'A returned item does not belong to this order.',
        undefined,
        'RETURN_ITEM_NOT_ON_ORDER'
      );
    }
    // What this line actually contributed to the order's subtotal, for the
    // quantity being returned.
    const lineCreditSyp = orderItem.discountPrice * returnItem.quantity;
    returnedGrossSyp += lineCreditSyp;
    lines.push({
      orderItemId: orderItem._id,
      productId: orderItem.productId,
      productNameAr: orderItem.productNameAr,
      productNameEn: orderItem.productNameEn,
      quantity: returnItem.quantity,
      orderedQuantity: orderItem.quantity,
      unitChargedSyp: orderItem.discountPrice,
      lineGrossSyp: lineCreditSyp,
    });
  }

  const orderGrossSyp = order.totalPrice;
  const discountCodeSyp = order.discountCode?.discountSyp ?? 0;
  const orderReductionsSyp =
    (order.discountAmount ?? 0) + (order.advertisementDiscountAmount ?? 0) + discountCodeSyp;

  // The share of the order-level reductions (platform discount + advertisement
  // package discount + discount code) that belongs to the returned slice.
  // Guarded against a zero subtotal, which can only happen on a legacy
  // zero-priced order.
  const reductionShareSyp =
    orderGrossSyp > 0
      ? Math.round((orderReductionsSyp * returnedGrossSyp) / orderGrossSyp)
      : 0;

  const rawCreditSyp = returnedGrossSyp - reductionShareSyp;

  // Is every unit of every line now returned (counting anything credited
  // before)? If so the credit is pinned so the order's total credits land
  // exactly on its finalPrice, absorbing the rounding remainder rather than
  // leaving a lira or two of phantom debt behind.
  const returnedByItem = new Map();
  for (const returnItem of returnItems) {
    const key = String(returnItem.orderItemId);
    returnedByItem.set(key, (returnedByItem.get(key) ?? 0) + returnItem.quantity);
  }
  const isFinalReturn = orderItems.every(
    (item) => (returnedByItem.get(String(item._id)) ?? 0) >= item.quantity
  );

  const creditSyp = isFinalReturn
    ? Math.max(0, order.finalPrice - priorCreditsSyp)
    : Math.max(0, rawCreditSyp);

  // An admin code's compensation, undone in the same proportion as the goods
  // coming back - pinned to whatever is left of it on a full return, the same
  // way the credit is pinned to finalPrice.
  const platformCompensationSyp = platformCompensationOf(order);
  const remainingCompensationSyp = Math.max(0, platformCompensationSyp - priorCompensationClawbackSyp);
  const compensationClawbackSyp = isFinalReturn
    ? remainingCompensationSyp
    : orderGrossSyp > 0
      ? Math.min(
          remainingCompensationSyp,
          Math.round((platformCompensationSyp * returnedGrossSyp) / orderGrossSyp)
        )
      : 0;

  // Converted through the ORDER's own frozen rate, never today's - the credit
  // undoes a specific historical charge, so it has to speak that charge's
  // currency terms.
  const rate = order.fx?.rate ?? null;
  const creditUsd = rate ? round2(creditSyp / rate) : null;

  return {
    creditSyp,
    creditUsd,
    // The whole working, frozen onto the return and copied to the ledger
    // entry's metadata, so a statement or a dispute never recomputes it.
    breakdown: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber ?? null,
      returnedGrossSyp,
      orderGrossSyp,
      orderReductionsSyp,
      reductionShareSyp,
      rawCreditSyp,
      priorCreditsSyp,
      isFinalReturn,
      discountCodeSyp,
      platformCompensationSyp,
      compensationClawbackSyp,
      priorCompensationClawbackSyp,
      orderFinalPriceSyp: order.finalPrice,
      fxRate: rate,
      lines,
    },
  };
}

// Loads everything the valuation needs and runs it. Used by both the preview
// endpoint (read-only, so the warehouse sees the number before committing) and
// the approval path itself.
async function valueReturn(returnRequest, session = null) {
  const orderQuery = Order.findById(returnRequest.orderId);
  const itemsQuery = OrderItem.find({ orderId: returnRequest.orderId });
  if (session) {
    orderQuery.session(session);
    itemsQuery.session(session);
  }

  const [order, orderItems] = await Promise.all([orderQuery, itemsQuery]);
  if (!order) {
    throw ApiError.notFound('The original order was not found.', 'ORDER_NOT_FOUND');
  }

  const prior = await priorReturnsForOrder(order._id, session);

  return computeCredit({
    order,
    orderItems,
    returnItems: returnRequest.items,
    priorCreditsSyp: prior.creditsSyp,
    priorCompensationClawbackSyp: prior.compensationClawbackSyp,
  });
}

module.exports = { computeCredit, valueReturn, priorCreditsForOrder, priorReturnsForOrder };
