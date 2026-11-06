const Review = require('../models/paymentProofReview.model');
const Proof = require('../models/paymentProof.model');
const Payment = require('../models/payment.model');
const Entry = require('../models/ledgerEntry.model');
const Pharmacy = require('../models/pharmacy.model');
const { Epoch, Recognition } = require('../models/collectionAccounting.model');
// Read-only candidate projection. Confirmation rechecks every source under the
// account locks; appearing here is never permission to accrue by itself.
async function read(warehouseId, period, after, session) {
  const candidates = await Review.aggregate([
    { $match: { warehouseId, decision: 'approved', ...(after ? { _id: { $lt: after } } : {}) } },
    { $lookup: { from: Proof.collection.name, localField: 'proofId', foreignField: '_id', as: 'proof' } },
    { $unwind: '$proof' },
    { $match: { 'proof.warehouseId': warehouseId, 'proof.collector': 'warehouse' } },
    { $lookup: { from: Payment.collection.name, localField: 'paymentId', foreignField: '_id', as: 'payment' } },
    { $unwind: '$payment' },
    { $match: { 'payment.warehouseId': warehouseId, 'payment.status': 'posted', 'payment.kind': 'settlement',
      'payment.paidAt': { $gte: period.from, $lte: period.to } } },
    { $lookup: { from: Entry.collection.name, localField: 'payment.ledgerEntryId', foreignField: '_id', as: 'entry' } },
    { $unwind: '$entry' },
    { $lookup: { from: Epoch.collection.name, localField: 'proof.accountId', foreignField: 'accountId', as: 'epoch' } },
    { $unwind: '$epoch' },
    { $match: { 'epoch.warehouseId': warehouseId, 'entry.warehouseId': warehouseId, 'entry.kind': 'payment', $expr: { $and: [
      { $eq: ['$proof.paymentId', '$payment._id'] }, { $eq: ['$proof.ledgerEntryId', '$entry._id'] },
      { $eq: ['$proof.amountSyp', '$payment.amountSyp'] }, { $eq: ['$entry.amountSyp', '$payment.amountSyp'] },
      { $eq: ['$proof.accountId', '$payment.accountId'] }, { $eq: ['$entry.accountId', '$payment.accountId'] },
      { $eq: ['$entry.source.paymentId', '$payment._id'] }, { $gt: ['$entry.sequence', '$epoch.openingSequence'] },
    ] } } },
    { $lookup: { from: Recognition.collection.name, localField: 'paymentId', foreignField: 'paymentId', as: 'recognized' } },
    { $match: { recognized: { $size: 0 } } }, { $sort: { _id: -1 } }, { $limit: 21 },
    { $project: { _id: 1, paymentId: 1, proofId: 1, approvedAt: '$at', approvedBy: '$reviewedBy',
      proofReference: '$proof.proofReference', pharmacyId: '$proof.pharmacyId', amountSyp: '$payment.amountSyp', paidAt: '$payment.paidAt' } },
  ]).session(session);
  const rows = candidates.slice(0, 20);
  const names = await Pharmacy.find({ _id: { $in: rows.map(r => r.pharmacyId) } }).select('nameAr nameEn').session(session).lean();
  const byId = new Map(names.map(p => [String(p._id), p]));
  return { rows: rows.map(({ _id, ...row }) => ({ id: _id, ...row, pharmacy: byId.get(String(row.pharmacyId)) ?? null })),
    hasMore: candidates.length > 20, nextCursor: candidates.length > 20 ? rows[rows.length - 1]._id : null };
}
module.exports = { read };
