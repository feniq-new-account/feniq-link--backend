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
    .select('balanceSyp')
    .session(session)
    .lean();
  return account?.balanceSyp ?? 0;
}

async function addEntry({ pharmacyId, warehouseId, orderId, kind, amountSyp }, session) {
  await CreditEntry.create([{ pharmacyId, warehouseId, orderId, kind, amountSyp }], { session });
}

// Takes `amountSyp` for a new order. The decrement is conditional on the
// balance still covering it, so two orders racing for the same credit can never
// overdraw it: the loser is refused (CREDIT_CHANGED) and the pharmacy re-sends.
async function useCredit({ pharmacyId, warehouseId, orderId, amountSyp }, session) {
  if (!(amountSyp > 0)) return;
  const updated = await PharmacyCredit.findOneAndUpdate(
    { pharmacyId, warehouseId, balanceSyp: { $gte: amountSyp } },
    { $inc: { balanceSyp: -amountSyp } },
    { new: true, session }
  );
  if (!updated) {
    throw ApiError.conflict('Your credit at this warehouse changed - please send the order again.', 'CREDIT_CHANGED');
  }
  await addEntry({ pharmacyId, warehouseId, orderId, kind: 'used', amountSyp }, session);
}

async function giveBack({ pharmacyId, warehouseId, orderId, amountSyp }, session) {
  if (!(amountSyp > 0)) return;
  await PharmacyCredit.updateOne(
    { pharmacyId, warehouseId },
    { $inc: { balanceSyp: amountSyp } },
    { upsert: true, session }
  );
  await addEntry({ pharmacyId, warehouseId, orderId, kind: 'released', amountSyp }, session);
}

// On delivery: the pharmacy's quarter of this order's rep commission becomes
// credit. Once per order (pharmacyCreditedAt, and a unique index on the entry).
async function earnForDelivery(order, session) {
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
