const PharmacyCredit = require('../models/pharmacyCredit.model');
const CreditEntry = require('../models/creditEntry.model');
const Order = require('../models/order.model');
const { ApiError } = require('../utils/ApiError');

// The pharmacy's credit at a warehouse - its quarter of the rep commission on
// its delivered orders (utils/repCommission.js) - and the three things that
// move it: earned on delivery, used on the next order automatically, released
// when that order is cancelled or edited down. Every movement runs inside the
// caller's transaction (`session`), next to the order change that causes it.

// The credit account is created before any transaction opens (an upsert that
// has to create the collection inside a transaction costs write conflicts -
// the same reason ledger accounts are resolved up front, see
// warehouseOrder.service.js).
async function ensureAccount(pharmacyId, warehouseId) {
  await PharmacyCredit.updateOne(
    { pharmacyId, warehouseId },
    { $setOnInsert: { balanceSyp: 0 } },
    { upsert: true }
  );
}

async function balanceFor(pharmacyId, warehouseId, session = null) {
  const account = await PharmacyCredit.findOne({ pharmacyId, warehouseId })
    .select('balanceSyp loyaltyBalanceSyp')
    .session(session)
    .lean();
  return (account?.balanceSyp ?? 0) + Math.max(0, account?.loyaltyBalanceSyp ?? 0);
}

async function addEntry(entry, session) {
  await CreditEntry.create([entry], { session });
}

// Takes `amountSyp` for a new order. The decrement is conditional on the
// balance still covering it, so two orders racing for the same credit can never
// overdraw it: the loser is refused (CREDIT_CHANGED) and the pharmacy re-sends.
async function useCredit({ pharmacyId, warehouseId, orderId, amountSyp }, session) {
  if (!(amountSyp > 0)) return;
  const account = await PharmacyCredit.findOne({ pharmacyId, warehouseId }).session(session).lean();
  const commissionSyp = Math.min(account?.balanceSyp ?? 0, amountSyp);
  const loyaltySyp = amountSyp - commissionSyp;
  if (!account || loyaltySyp > Math.max(0, account.loyaltyBalanceSyp ?? 0)) {
    throw ApiError.conflict('Your credit at this warehouse changed - please send the order again.', 'CREDIT_CHANGED');
  }
  const changed = await PharmacyCredit.updateOne({ _id: account._id,
    balanceSyp: { $gte: commissionSyp },
    ...(loyaltySyp ? { loyaltyBalanceSyp: { $gte: loyaltySyp } } : {}),
  }, { $inc: { balanceSyp: -commissionSyp, loyaltyBalanceSyp: -loyaltySyp } }, { session });
  if (changed.modifiedCount !== 1) throw ApiError.conflict('Credit changed.', 'CREDIT_CHANGED');
  await addEntry({ pharmacyId, warehouseId, orderId, kind: 'used', amountSyp, commissionSyp, loyaltySyp }, session);
}

async function giveBack({ pharmacyId, warehouseId, orderId, amountSyp }, session) {
  if (!(amountSyp > 0)) return;
  // Return to the source actually spent. Legacy entries have no split and
  // are entirely commission. Partial edits can release in several steps.
  const entries = await CreditEntry.find({ orderId, pharmacyId, warehouseId, kind: { $in: ['used', 'released'] } })
    .session(session).lean();
  let commissionRemaining = 0, loyaltyRemaining = 0;
  for (const entry of entries) {
    const sign = entry.kind === 'used' ? 1 : -1;
    commissionRemaining += sign * (entry.commissionSyp ?? entry.amountSyp);
    loyaltyRemaining += sign * (entry.loyaltySyp ?? 0);
  }
  const loyaltySyp = Math.min(Math.max(0, loyaltyRemaining), amountSyp);
  const commissionSyp = amountSyp - loyaltySyp;
  if (commissionSyp > commissionRemaining) throw ApiError.conflict('Credit release exceeds the original use.', 'CREDIT_CHANGED');
  await PharmacyCredit.updateOne(
    { pharmacyId, warehouseId }, { $inc: { balanceSyp: commissionSyp, loyaltyBalanceSyp: loyaltySyp } }, { upsert: true, session }
  );
  await addEntry({ pharmacyId, warehouseId, orderId, kind: 'released', amountSyp, commissionSyp, loyaltySyp }, session);
}

// On delivery: the pharmacy's quarter of this order's rep commission becomes
// credit. Once per order (pharmacyCreditedAt, and a unique index on the entry).
async function earnForDelivery(order, session) {
  if (order.commissionEngine === 'collection_v2') return 0;
  const amountSyp = order.repCommission?.pharmacyAmount ?? 0;
  if (!(amountSyp > 0) || order.repCommission.pharmacyCreditedAt) return 0;
  const now = new Date();
  const marked = await Order.updateOne(
    { _id: order._id, 'repCommission.pharmacyCreditedAt': null },
    { $set: { 'repCommission.pharmacyCreditedAt': now } },
    { session }
  );
  if (marked.modifiedCount !== 1) return 0;
  order.repCommission.pharmacyCreditedAt = now;
  await PharmacyCredit.updateOne(
    { pharmacyId: order.pharmacyId, warehouseId: order.warehouseId },
    { $inc: { balanceSyp: amountSyp } },
    { upsert: true, session }
  );
  await addEntry(
    { pharmacyId: order.pharmacyId, warehouseId: order.warehouseId, orderId: order._id, kind: 'earned', amountSyp },
    session
  );
  return amountSyp;
}

// On cancellation: whatever credit the order took goes back. Once per order.
async function releaseForCancel(order, session) {
  if (order.commissionEngine === 'collection_v2') await require('./collectionReturnCredit.service').releaseExcess(
    order, order.cancelledBy ?? order.statusHistory?.[order.statusHistory.length - 1]?.changedBy,
    0, `cancel:${order._id}`, session);
  const amountSyp = order.creditUsedSyp ?? 0;
  if (!(amountSyp > 0) || order.creditReleasedAt) return 0;
  const now = new Date();
  const marked = await Order.updateOne(
    { _id: order._id, creditReleasedAt: null },
    { $set: { creditReleasedAt: now } },
    { session }
  );
  if (marked.modifiedCount !== 1) return 0;
  order.creditReleasedAt = now;
  await giveBack(
    { pharmacyId: order.pharmacyId, warehouseId: order.warehouseId, orderId: order._id, amountSyp },
    session
  );
  return amountSyp;
}

// The pharmacy's credit movements at one warehouse, newest first.
async function listEntries(pharmacyId, warehouseId, { limit = 20 } = {}) {
  return CreditEntry.find({ pharmacyId, warehouseId }).sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = { ensureAccount, balanceFor, useCredit, giveBack, earnForDelivery, releaseForCancel, listEntries };
