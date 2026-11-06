const mongoose = require('mongoose');
const Order = require('../models/order.model');
const LedgerEntry = require('../models/ledgerEntry.model');
const { platformCompensationOf } = require('./discountCode.service');
const { parseRangeStart, parseRangeEnd, startOfBusinessMonth } = require('../utils/businessTime');
const { financialReadSnapshot } = require('../utils/financialReadSnapshot');
const { Event: CollectionEvent, ReturnCredit, Invoice } = require('../models/collectionAccounting.model');

// Money-Flow V2. What a warehouse owes the platform, and what it actually
// nets, for a period.
//
// V1 computed `commissionAmount` on every order and then read it nowhere: dead
// financial data. This gives it a reader without inventing a collection flow
// that does not exist operationally - it is a REPORT over frozen order fields,
// not a second ledger. Nothing here posts an entry or moves a balance.
//
// The figures, per delivered order in the period:
//
//   sales       = order.finalPrice          (what the pharmacy was charged)
//   commission  = order.commissionSyp       (1% of finalPrice, frozen at order time)
//   net         = sales - commission        (what the warehouse keeps)
//
// less, for anything credited back on a return:
//
//   creditedSales      = the return credit
//   commissionClawback = commission x (credit / finalPrice)
//
// so a warehouse is not charged commission on money it never collected.
//
// Discount codes (discountCode.service.js). An ADMIN code is paid by the
// platform, so on such an order the platform owes the warehouse the whole code
// discount - frozen on the order as discountCode.platformCompensationSyp. It is
// part of what the warehouse earns, alongside what the pharmacy was charged:
//
//   compensation         = order.discountCode.platformCompensationSyp (0 otherwise)
//   compensationClawback = the returned slice's share of it, frozen on the
//                          return's credit (returnCredit.service.js)
//   net                  = sales - credits + compensation - clawback - commission
//
// and the commission clawback is taken on the share of that whole revenue a
// return undoes - identical to the rule above when there is no admin code.
// Like commission, the compensation accrues when the order is DELIVERED (a
// cancelled order never gets here) and is never posted to the pharmacy
// ledger; commissionCollection.service.js nets it against the commission owed.

function round(amount) {
  return Math.round(amount);
}

function toObjectId(value) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));
}

// Defaults to the current calendar month, which is the period a warehouse
// actually settles on. Read in the business time zone (utils/businessTime.js):
// a bare "to" date covers that whole local day, so a range ending today counts
// what was delivered today, and "this month" starts at local midnight on the
// 1st - not at whatever midnight the server's own zone happens to have.
function resolvePeriod({ from, to } = {}) {
  const now = new Date();
  const start = from ? parseRangeStart(from) : startOfBusinessMonth(now);
  const end = to ? parseRangeEnd(to) : now;
  if (!start || !end) {
    return { from: startOfBusinessMonth(now), to: now, invalid: true };
  }
  return { from: start, to: end, invalid: false };
}

// The commission attributable to a credited return: the same proportion of the
// order's frozen commission as the return undoes of what the warehouse earned
// on it - the pharmacy's credit plus the platform compensation clawed back for
// an admin code. With no admin code that is simply credit / finalPrice.
// Rounded once, and clamped so a full credit can never claw back more than was
// charged in the first place. (Also right on an order a code brought to 0: the
// warehouse still earned the compensation, and a return still undoes it.)
function commissionClawbackFor(order, creditSyp, compensationClawbackSyp = 0) {
  if (!order || !order.commissionAmount) return 0;
  const revenueSyp = (order.finalPrice ?? 0) + platformCompensationOf(order);
  if (!revenueSyp) return 0;
  const share = Math.min(1, (creditSyp + compensationClawbackSyp) / revenueSyp);
  return Math.min(order.commissionAmount, round(order.commissionAmount * share));
}

// The compensation clawed back on an order: what its return credits froze for
// it, never more than the order's compensation.
function compensationClawbackFor(order, frozenClawbackSyp) {
  return Math.min(platformCompensationOf(order), Math.max(0, round(frozenClawbackSyp)));
}

async function getSettlementForWarehouse(warehouseId, query = {}, session = null) {
  return session ? readSettlement(warehouseId, query, session)
    : financialReadSnapshot(snapshot => readSettlement(warehouseId, query, snapshot));
}
async function readSettlement(warehouseId, { from, to } = {}, session) {
  const period = resolvePeriod({ from, to });
  const whId = toObjectId(warehouseId);

  // Delivered orders in the period. `deliveredAt` is the business date the
  // charge was posted on, so it is what a settlement period is cut by -
  // createdAt would put an order in the month it was placed rather than the
  // month it was billed.
  const orders = await Order.find({
    warehouseId: whId,
    status: 'delivered',
    deliveredAt: { $gte: period.from, $lte: period.to },
  })
    .select('orderNumber invoiceNumber deliveredAt totalPrice discountAmount advertisementDiscountAmount discountCode finalPrice commissionAmount pharmacyId commissionEngine collectionCommission')
    .sort({ deliveredAt: 1 })
    .session(session)
    .lean();

  const orderIds = orders.map((order) => order._id);
  const orderById = new Map(orders.map((order) => [String(order._id), order]));

  // Credits raised against those orders, whenever they were raised - a return
  // credited in October against a September order reduces the commission on
  // the order it belongs to, which is how a clawback has to work.
  const credits = orderIds.length
    ? await LedgerEntry.find({
        kind: 'return_credit',
        'metadata.orderId': { $in: orderIds },
      })
        .select('amountSyp effectiveAt metadata')
        .session(session)
        .lean()
    : [];

  const creditByOrderId = new Map();
  const compensationClawbackByOrderId = new Map();
  for (const credit of credits) {
    const key = String(credit.metadata.orderId);
    creditByOrderId.set(key, (creditByOrderId.get(key) ?? 0) + credit.amountSyp);
    compensationClawbackByOrderId.set(
      key,
      (compensationClawbackByOrderId.get(key) ?? 0) + (credit.metadata.compensationClawbackSyp ?? 0)
    );
  }

  let grossSalesSyp = 0;
  let grossCommissionSyp = 0;
  let creditedSalesSyp = 0;
  let commissionClawbackSyp = 0;
  let grossCompensationSyp = 0;
  let compensationClawbackSyp = 0;

  const events = await CollectionEvent.find({ warehouseId: whId, at: { $gte: period.from, $lte: period.to } })
    .select('feniqSyp repSyp originalCommissionSyp at invoiceId sourceKey').session(session).lean();
  const grants = await ReturnCredit.find({ warehouseId: whId, issuedAt: { $gte: period.from, $lte: period.to } })
    .select('amountSyp compensationClawbackSyp returnId invoiceId issuedAt').session(session).lean();
  const references = await Invoice.find({ warehouseId: whId, _id: { $in: [...events.map(e => e.invoiceId), ...grants.map(g => g.invoiceId)] } })
    .select('orderId invoiceNumber').session(session).lean();
  const invoiceById = new Map(references.map(i => [String(i._id), i]));
  const v2ByOrder = new Map();
  for (const event of events) {
    const id = String(invoiceById.get(String(event.invoiceId))?.orderId);
    const value = v2ByOrder.get(id) ?? { commissionSyp: 0, correctionSyp: 0, creditSyp: 0, compensationSyp: 0 };
    value.commissionSyp += Math.max(0, event.feniqSyp); value.correctionSyp -= Math.min(0, event.feniqSyp); v2ByOrder.set(id, value);
  }
  for (const grant of grants) {
    const id = String(invoiceById.get(String(grant.invoiceId))?.orderId);
    const value = v2ByOrder.get(id) ?? { commissionSyp: 0, correctionSyp: 0, creditSyp: 0, compensationSyp: 0 };
    value.creditSyp += grant.amountSyp; value.compensationSyp += grant.compensationClawbackSyp ?? 0; v2ByOrder.set(id, value);
  }
  const rows = orders.map((order) => {
    const key = String(order._id);
    const v2 = order.commissionEngine === 'collection_v2' ? v2ByOrder.get(key) ?? { commissionSyp: 0, correctionSyp: 0, creditSyp: 0, compensationSyp: 0 } : null;
    const creditSyp = v2 ? v2.creditSyp : creditByOrderId.get(key) ?? 0;
    const compensationSyp = platformCompensationOf(order);
    const compClawbackSyp = v2 ? v2.compensationSyp : compensationClawbackFor(order, compensationClawbackByOrderId.get(key) ?? 0);
    const clawbackSyp = v2 ? v2.correctionSyp : commissionClawbackFor(order, creditSyp, compClawbackSyp);
    const rowCommissionSyp = v2 ? v2.commissionSyp : order.commissionAmount;
    const netSalesSyp = order.finalPrice - creditSyp;
    const netCommissionSyp = rowCommissionSyp - clawbackSyp;
    const netCompensationSyp = compensationSyp - compClawbackSyp;

    grossSalesSyp += order.finalPrice;
    grossCommissionSyp += order.commissionAmount;
    creditedSalesSyp += v2 ? 0 : creditSyp;
    commissionClawbackSyp += v2 ? 0 : clawbackSyp;
    grossCompensationSyp += compensationSyp;
    compensationClawbackSyp += v2 ? 0 : compClawbackSyp;

    return {
      orderId: order._id,
      ...(order.commissionEngine === 'collection_v2' ? { commissionEngine: 'collection_v2',
        commissionPotentialSyp: order.collectionCommission?.originalCommissionSyp ?? 0 } : {}),
      orderNumber: order.orderNumber,
      invoiceNumber: order.invoiceNumber ?? null,
      deliveredAt: order.deliveredAt,
      pharmacyId: order.pharmacyId,
      // The full pricing story for one line of the report.
      subtotalSyp: order.totalPrice,
      platformDiscountSyp: order.discountAmount,
      advertisementDiscountSyp: order.advertisementDiscountAmount ?? 0,
      discountCode: order.discountCode?.code ?? null,
      discountCodeSyp: order.discountCode?.discountSyp ?? 0,
      discountCodeFundedBy: order.discountCode?.fundedBy ?? null,
      salesSyp: order.finalPrice,
      commissionSyp: rowCommissionSyp,
      creditedSyp: creditSyp,
      commissionClawbackSyp: clawbackSyp,
      // What the platform owes the warehouse for an admin code on this order.
      platformCompensationSyp: compensationSyp,
      compensationClawbackSyp: compClawbackSyp,
      netCompensationSyp,
      netSalesSyp,
      netCommissionSyp,
      // What the warehouse keeps on this order.
      warehouseNetSyp: netSalesSyp + netCompensationSyp - netCommissionSyp,
    };
  });

  const collectionAccrualSyp = events.reduce((n, event) => n + Math.max(0, event.feniqSyp), 0);
  const collectionCorrectionSyp = events.reduce((n, event) => n + Math.min(0, event.feniqSyp), 0);
  const legacyDeliveryCommissionSyp = grossCommissionSyp - commissionClawbackSyp;
  const collectionReturnIssuedSyp = grants.reduce((n, grant) => n + grant.amountSyp, 0);
  creditedSalesSyp += collectionReturnIssuedSyp;
  const collectionCompensationClawbackSyp = grants.reduce((n, grant) => n + (grant.compensationClawbackSyp ?? 0), 0);
  compensationClawbackSyp += collectionCompensationClawbackSyp;
  grossCommissionSyp += collectionAccrualSyp;
  commissionClawbackSyp -= collectionCorrectionSyp;
  const netSalesSyp = grossSalesSyp - creditedSalesSyp;
  const netCommissionSyp = grossCommissionSyp - commissionClawbackSyp;
  const netCompensationSyp = grossCompensationSyp - compensationClawbackSyp;

  return {
    period: { from: period.from, to: period.to },
    ...(events.length || grants.length || orders.some(order => order.commissionEngine === 'collection_v2') ? {
      asOf: new Date(), collectionCommission: { legacyDeliveryCommissionSyp, collectionAccrualSyp, collectionCorrectionSyp,
        collectionReturnIssuedSyp, collectionCompensationClawbackSyp,
        outsideDeliveryPeriod: [...v2ByOrder].filter(([orderId]) => !orderById.has(orderId)).map(([orderId, value]) => ({ orderId, ...value })),
        scope: 'v2_fees_and_goods_returns_by_posting_date_not_rep_share_or_delivery_fees', events },
    } : {}),
    totals: {
      orderCount: orders.length,
      // Sales: what pharmacies were charged for delivered orders.
      grossSalesSyp,
      // Returns credited back against those orders.
      creditedSalesSyp,
      netSalesSyp,
      // Commission: what the platform is owed, before and after clawback.
      grossCommissionSyp,
      commissionClawbackSyp,
      netCommissionSyp,
      // Compensation: what the platform owes the warehouse for admin discount
      // codes, before and after returns clawed part of it back.
      grossCompensationSyp,
      compensationClawbackSyp,
      netCompensationSyp,
      // What the warehouse keeps. Deliberately the last figure, because it is
      // the one a warehouse actually plans around.
      warehouseNetSyp: netSalesSyp + netCompensationSyp - netCommissionSyp,
    },
    rows,
  };
}

module.exports = {
  getSettlementForWarehouse,
  commissionClawbackFor,
  compensationClawbackFor,
  resolvePeriod,
};
