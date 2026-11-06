const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { rolePermissions } = require('../utils/rolePermissions');
const { requestFingerprint, idempotencyKeyReusedError } = require('../utils/idempotency');
const { parseRangeStart, parseRangeEnd } = require('../utils/businessTime');
const { runInTransaction } = require('../utils/transaction');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Payment = require('../models/payment.model');
const Proof = require('../models/paymentProof.model');
const Review = require('../models/paymentProofReview.model');
const Entry = require('../models/ledgerEntry.model');
const { Settlement, Recognition, Epoch } = require('../models/collectionAccounting.model');
const ledger = require('./ledger.service');
const collectionLedger = require('./collectionLedger.service');
const audit = require('./financialAudit.service');
const invalid = () => ApiError.badRequest('Invalid collection settlement.', undefined, 'INVALID_COLLECTION_SETTLEMENT');
function id(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw invalid();
  return new mongoose.Types.ObjectId(value).toHexString();
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
  return value.trim();
}

// Persisted approval of the actual weekly settlement document. It does NOT
// claim that a commission cash payment occurred: the existing platform cash
// collection record remains separate from eligibility and pharmacy debt.
async function confirmWarehouseSettlement(actorId, warehouseId, body) {
  actorId = id(actorId); warehouseId = id(warehouseId);
  if (!body || Array.isArray(body) || Object.keys(body).some(k => !['periodFrom', 'periodTo', 'proofReviewIds', 'reference', 'idempotencyKey'].includes(k))) throw invalid();
  const reference = text(body.reference, 500), key = text(body.idempotencyKey, 100);
  const from = parseRangeStart(body.periodFrom), to = parseRangeEnd(body.periodTo);
  if (!from || !to || from > to || !Array.isArray(body.proofReviewIds) || !body.proofReviewIds.length || body.proofReviewIds.length > 100) throw invalid();
  const proofReviewIds = body.proofReviewIds.map(id).sort();
  if (new Set(proofReviewIds).size !== proofReviewIds.length) throw invalid();
  const fingerprint = requestFingerprint('collection-settlement-v1', { actorId, warehouseId,
    from: from.toISOString(), to: to.toISOString(), proofReviewIds, reference });
  const work = async session => {
    const actor = await User.findById(actorId).select('role status').session(session).lean();
    if (!rolePermissions(actor).platformManage) throw ApiError.forbidden('An active platform administrator must confirm the settlement.');
    const existing = await Settlement.findOne({ warehouseId, idempotencyKey: key }).session(session).lean();
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw idempotencyKeyReusedError('Settlement key identifies different evidence.');
      return { settlement: existing, replay: true };
    }
    const warehouse = await Warehouse.findOneAndUpdate({ _id: warehouseId, commissionEngine: 'collection_v2' },
      { $inc: { collectionPolicyLock: 1 } }, { session, new: true, timestamps: false });
    if (!warehouse) throw ApiError.notFound('Collection warehouse not found.', 'WAREHOUSE_NOT_FOUND');
    const reviews = await Review.find({ _id: { $in: proofReviewIds }, warehouseId, decision: 'approved' }).session(session).lean();
    if (reviews.length !== proofReviewIds.length) throw invalid();
    const proofs = await Proof.find({ _id: { $in: reviews.map(r => r.proofId) }, warehouseId, collector: 'warehouse' }).session(session).lean();
    if (proofs.length !== reviews.length) throw invalid();
    const byProofId = new Map(proofs.map(p => [String(p._id), p]));
    const accounts = [...new Set(proofs.map(p => String(p.accountId)))].sort();
    // One deterministic order for multi-account writes prevents cross-account
    // contention loops. This conflicts with payment reversal and other posting.
    for (const accountId of accounts) await ledger.lockAccountForFinancialChange(accountId, warehouseId, session);
    const payments = await Payment.find({ _id: { $in: proofs.map(p => p.paymentId) }, warehouseId,
      kind: 'settlement', status: 'posted', paidAt: { $gte: from, $lte: to },
    }).session(session).lean();
    if (payments.length !== proofs.length || new Set(payments.map(p => String(p._id))).size !== proofs.length) {
      throw ApiError.conflict('All settlement receipts must be posted and inside its recorded period.', 'SETTLEMENT_RECEIPT_INVALID');
    }
    if (await Recognition.exists({ paymentId: { $in: payments.map(p => p._id) } }).session(session)) {
      throw ApiError.conflict('A receipt already belongs to a confirmed settlement.', 'RECEIPT_ALREADY_RECOGNIZED');
    }
    const paymentById = new Map(payments.map(p => [String(p._id), p]));
    for (const proof of proofs) {
      const payment = paymentById.get(String(proof.paymentId));
      const epoch = await Epoch.findOne({ accountId: proof.accountId, warehouseId }).session(session).lean();
      const entry = await Entry.findOne({ _id: payment.ledgerEntryId, warehouseId, accountId: proof.accountId,
        kind: 'payment', 'source.paymentId': payment._id }).session(session).lean();
      if (!epoch || !entry || entry.sequence <= epoch.openingSequence || entry.amountSyp !== proof.amountSyp ||
          payment.amountSyp !== proof.amountSyp || String(payment.accountId) !== String(proof.accountId)) {
        throw ApiError.conflict('A receipt cannot be reclassified from historical or unverified cash.', 'SETTLEMENT_SOURCE_UNVERIFIED');
      }
    }
    const [settlement] = await Settlement.create([{ warehouseId, periodFrom: from, periodTo: to,
      cadence: 'weekly', proofReviewIds, reference, confirmedBy: actorId, confirmedAt: session.financialOperationAt,
      idempotencyKey: key, fingerprint,
    }], { session });
    for (const review of reviews) {
      const proof = byProofId.get(String(review.proofId));
      if (!proof || String(review.paymentId) !== String(proof.paymentId)) throw invalid();
      await Recognition.create([{ paymentId: proof.paymentId, accountId: proof.accountId,
        warehouseId, collector: 'warehouse', proofReviewId: review._id, settlementId: settlement._id,
        actorId, at: settlement.confirmedAt }], { session });
    }
    for (const accountId of accounts) await collectionLedger.rebuildAccount({ accountId, warehouseId,
      actorId, sourceKey: `settlement:${settlement._id}`, reason: reference,
    }, session);
    await audit.record({ action: 'commission.settlement_confirmed', actorId, actorRole: 'admin',
      onBehalfOfWarehouseId: warehouseId, entityType: 'CollectionSettlement', entityId: settlement._id,
      reason: reference, idempotencyKey: key, after: { proofReviewIds, cadence: 'weekly', periodFrom: from, periodTo: to },
    }, session);
    return { settlement: settlement.toObject(), replay: false };
  };
  try { return await runInTransaction(work); }
  catch (err) {
    if (err?.code === 11000) return runInTransaction(work);
    throw err;
  }
}

module.exports = { confirmWarehouseSettlement };
