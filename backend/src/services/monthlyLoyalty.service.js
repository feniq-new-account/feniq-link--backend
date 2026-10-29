const Period = require('../models/monthlyLoyaltyPeriod.model');
const Credit = require('../models/pharmacyCredit.model');
const CreditEntry = require('../models/creditEntry.model');
const Order = require('../models/order.model');
const { loyaltyDiscountFor } = require('../utils/loyalty');
const { businessDateOf } = require('../utils/businessTime');
const { ApiError } = require('../utils/ApiError');

// Only delivered net invoice value earns monthly rewards. Pending/cancelled
// orders never earn. Each business month's first delivery freezes its tiers;
// changing settings cannot retroactively restate that month's entitlement.
async function prepareDelivery(order, now = new Date()) {
  if (!order.monthlyLoyalty?.tiers?.length) return null;
  const period = businessDateOf(now).slice(0, 7);
  await Period.init();
  await Credit.updateOne({ pharmacyId: order.pharmacyId, warehouseId: order.warehouseId },
    { $setOnInsert: { balanceSyp: 0, loyaltyBalanceSyp: 0 } }, { upsert: true });
  try {
  await Period.updateOne({ pharmacyId: order.pharmacyId, warehouseId: order.warehouseId, period },
    { $setOnInsert: { tiers: [], eligibleSyp: 0, entitlementSyp: 0 } }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; } // another first delivery won the period
  return period;
}

async function changeEntitlement({ order, period, changeSyp, returnId }, session) {
  const row = await Period.findOne({ pharmacyId: order.pharmacyId, warehouseId: order.warehouseId, period }).session(session);
  if (!row) throw ApiError.conflict('Monthly loyalty period missing.', 'LOYALTY_PERIOD_CHANGED');
  // Reserve only the period key outside the transaction. Terms freeze with
  // the first committed delivery, so a failed audit/charge cannot fix terms
  // for a month in which no delivery actually succeeded. Non-empty legacy
  // terms remain frozen even after a full return reduces eligibility to zero.
  if (!row.tiers.length) row.tiers = order.monthlyLoyalty.tiers;
  const eligible = row.eligibleSyp + changeSyp;
  if (!Number.isSafeInteger(eligible) || eligible < 0) {
    throw ApiError.conflict('Monthly purchase total changed.', 'LOYALTY_PERIOD_CHANGED');
  }
  const entitlement = loyaltyDiscountFor(eligible, row.tiers).discountSyp;
  const delta = entitlement - row.entitlementSyp;
  row.eligibleSyp = eligible;
  row.entitlementSyp = entitlement;
  await row.save({ session });
  if (delta !== 0) {
    // A spent reward reversed by a return is carried against future loyalty,
    // never against commission, and never becomes a cash debt/invoice charge.
    await Credit.updateOne({ pharmacyId: order.pharmacyId, warehouseId: order.warehouseId },
      { $inc: { loyaltyBalanceSyp: delta } }, { upsert: true, session });
    await CreditEntry.create([{
      pharmacyId: order.pharmacyId, warehouseId: order.warehouseId, orderId: order._id,
      kind: delta > 0 ? 'loyalty_earned' : 'loyalty_reversed', amountSyp: Math.abs(delta),
      loyaltySyp: Math.abs(delta), commissionSyp: 0, returnId, loyaltyPeriod: period,
    }], { session });
  }
  return delta;
}

async function earnForDelivery(order, period, session, now = new Date()) {
  if (!period || !order.monthlyLoyalty || order.monthlyLoyalty.creditedAt) return 0;
  const amount = order.finalPrice;
  const delta = await changeEntitlement({ order, period, changeSyp: amount }, session);
  order.monthlyLoyalty.period = period;
  order.monthlyLoyalty.eligibleSyp = amount;
  order.monthlyLoyalty.creditedAt = now;
  return delta;
}

async function reverseForReturn(returnRequest, creditSyp, session) {
  const order = await Order.findById(returnRequest.orderId).session(session);
  const loyalty = order?.monthlyLoyalty;
  if (!loyalty?.creditedAt || !loyalty.period) return 0;
  const remaining = loyalty.eligibleSyp - loyalty.reversedSyp;
  const reduction = Math.min(remaining, creditSyp);
  if (!(reduction > 0)) return 0;
  const delta = await changeEntitlement({ order, period: loyalty.period, changeSyp: -reduction, returnId: returnRequest._id }, session);
  loyalty.reversedSyp += reduction;
  await order.save({ session });
  return delta;
}

async function stateFor(pharmacyId, warehouseId, now = new Date(), defaultTiers = []) {
  const period = businessDateOf(now).slice(0, 7);
  const [row, credit] = await Promise.all([
    Period.findOne({ pharmacyId, warehouseId, period }).lean(),
    Credit.findOne({ pharmacyId, warehouseId }).select('loyaltyBalanceSyp').lean(),
  ]);
  const tiers = row?.tiers?.length ? row.tiers : defaultTiers;
  const eligibleSyp = row?.eligibleSyp ?? 0;
  const nextTier = tiers.find((tier) => tier.minSyp > eligibleSyp) ?? null;
  return { period, eligibleSyp, entitlementSyp: row?.entitlementSyp ?? 0,
    availableCreditSyp: Math.max(0, credit?.loyaltyBalanceSyp ?? 0),
    futureRewardOffsetSyp: Math.max(0, -(credit?.loyaltyBalanceSyp ?? 0)), nextTier };
}
module.exports = { prepareDelivery, earnForDelivery, reverseForReturn, stateFor };
