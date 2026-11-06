const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { rolePermissions } = require('../utils/rolePermissions');
const { warehouseForUserFilter } = require('../utils/loadWarehouse');
const { requestFingerprint, idempotencyKeyReusedError } = require('../utils/idempotency');
const { runInTransaction } = require('../utils/transaction');
const { financialReadSnapshot } = require('../utils/financialReadSnapshot');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Payment = require('../models/payment.model');
const LedgerEntry = require('../models/ledgerEntry.model');
const Proof = require('../models/paymentProof.model');
const Review = require('../models/paymentProofReview.model');
const ledger = require('./ledger.service');
const audit = require('./financialAudit.service');

const missing = () => ApiError.notFound('Payment proof not found.', 'PAYMENT_PROOF_NOT_FOUND');
const invalid = () => ApiError.badRequest('Invalid payment proof.', undefined, 'INVALID_PAYMENT_PROOF');
function objectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw missing();
  return new mongoose.Types.ObjectId(value).toHexString();
}
function text(value, max, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw invalid();
  return value.trim() || null;
}
function fields(body, names) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !names.includes(k))) throw invalid();
}
async function scope(actorId, permission, session) {
  const user = await User.findById(objectId(actorId)).select('role status warehouseRole').session(session).lean();
  if (!user || user.role !== 'warehouse' || user.status !== 'active' || !rolePermissions(user)[permission]) {
    throw ApiError.forbidden('An authorized warehouse accountant is required.', 'ACCOUNTANT_REQUIRED');
  }
  const warehouse = await Warehouse.findOne(warehouseForUserFilter(user._id)).select('_id').session(session).lean();
  if (!warehouse) throw missing();
  return { user, warehouseId: warehouse._id };
}
async function replay(Model, warehouseId, key, fingerprint, session = null) {
  const existing = await Model.findOne({ warehouseId, idempotencyKey: key }).session(session).lean();
  if (!existing) return null;
  if (existing.fingerprint !== fingerprint) throw idempotencyKeyReusedError('This key identifies another proof request.');
  return { record: existing, replay: true };
}
async function paymentForWrite(paymentId, warehouseId, session) {
  const first = await Payment.findOne({ _id: objectId(paymentId), warehouseId }).session(session).lean();
  if (!first || first.kind !== 'settlement' || !first.accountId || !first.ledgerEntryId) throw missing();
  await ledger.lockAccountForFinancialChange(first.accountId, warehouseId, session);
  const payment = await Payment.findOne({ _id: first._id, warehouseId }).session(session).lean();
  if (payment.status !== 'posted') throw ApiError.conflict('A reversed payment cannot receive proof approval.', 'PAYMENT_REVERSED');
  if (!Number.isSafeInteger(payment.amountSyp) || payment.amountSyp <= 0 || !payment.paidAt) throw invalid();
  const entry = await LedgerEntry.findOne({ _id: payment.ledgerEntryId, accountId: payment.accountId,
    warehouseId, kind: 'payment', 'source.paymentId': payment._id }).session(session).lean();
  if (!entry || entry.amountSyp !== payment.amountSyp || String(entry.pharmacyId) !== String(payment.pharmacyId)) {
    throw ApiError.conflict('The original payment ledger source cannot be verified.', 'PAYMENT_PROOF_SOURCE_UNVERIFIED');
  }
  return payment;
}

async function submit(actorId, paymentId, body) {
  fields(body, ['proofReference', 'note', 'idempotencyKey']);
  actorId = objectId(actorId); paymentId = objectId(paymentId);
  const proofReference = text(body.proofReference, 500, true);
  const note = text(body.note, 1000);
  const key = text(body.idempotencyKey, 100, true);
  const fingerprint = requestFingerprint('warehouse-payment-proof-v1', {
    actorId: String(actorId), paymentId: String(paymentId), proofReference, note,
  });
  let warehouseId;
  try {
    return await runInTransaction(async session => {
      ({ warehouseId } = await scope(actorId, 'paymentRecord', session));
      const existing = await replay(Proof, warehouseId, key, fingerprint, session);
      if (existing) return existing;
      const payment = await paymentForWrite(paymentId, warehouseId, session);
      const previous = await Proof.findOne({ paymentId, warehouseId }).sort({ revision: -1 }).session(session).lean();
      if (previous) {
        const decision = await Review.findOne({ proofId: previous._id, warehouseId }).session(session).lean();
        if (!decision || decision.decision !== 'rejected') {
          throw ApiError.conflict('This payment already has pending or approved proof.', 'PAYMENT_PROOF_EXISTS');
        }
      }
      const [proof] = await Proof.create([{
        warehouseId, pharmacyId: payment.pharmacyId, accountId: payment.accountId,
        paymentId: payment._id, ledgerEntryId: payment.ledgerEntryId,
        revision: (previous?.revision ?? 0) + 1, collector: 'warehouse', proofReference, note,
        amountSyp: payment.amountSyp, amountUsd: payment.amountUsd, paidAt: payment.paidAt,
        fx: payment.fx ?? null, submittedBy: actorId, at: new Date(), idempotencyKey: key, fingerprint,
      }], { session });
      await audit.record({ action: 'payment.proof_submitted', actorId, actorRole: 'warehouse',
        entityType: 'PaymentProof', entityId: proof._id, accountId: payment.accountId,
        ledgerEntryIds: [payment.ledgerEntryId], idempotencyKey: key,
        after: { paymentId: payment._id, revision: proof.revision, collector: 'warehouse' },
      }, session);
      return { record: proof.toObject(), replay: false };
    });
  } catch (err) {
    if (err?.code === 11000 && warehouseId) {
      // Retry after a concurrent commit. Scope is rechecked; no disclosure to
      // another tenant or a user who has since lost permission.
      return runInTransaction(async session => {
        const current = await scope(actorId, 'paymentRecord', session);
        const existing = await replay(Proof, current.warehouseId, key, fingerprint, session);
        if (existing) return existing;
        throw err;
      });
    }
    throw err;
  }
}

async function review(actorId, paymentId, proofId, body) {
  fields(body, ['decision', 'reason', 'idempotencyKey']);
  actorId = objectId(actorId); paymentId = objectId(paymentId); proofId = objectId(proofId);
  if (!['approved', 'rejected'].includes(body.decision)) throw invalid();
  const reason = text(body.reason, 1000, body.decision === 'rejected');
  const key = text(body.idempotencyKey, 100, true);
  const fingerprint = requestFingerprint('warehouse-payment-proof-review-v1', {
    actorId: String(actorId), paymentId: String(paymentId), proofId: String(proofId), decision: body.decision, reason,
  });
  let warehouseId;
  try {
    return await runInTransaction(async session => {
      ({ warehouseId } = await scope(actorId, 'paymentProofReview', session));
      const existing = await replay(Review, warehouseId, key, fingerprint, session);
      if (existing) return existing;
      const payment = await paymentForWrite(paymentId, warehouseId, session);
      const proof = await Proof.findOne({ _id: proofId, paymentId, warehouseId }).session(session).lean();
      if (!proof) throw missing();
      const previous = await Review.findOne({ proofId, warehouseId }).session(session).lean();
      if (previous) throw ApiError.conflict('This proof already has an immutable decision.', 'PAYMENT_PROOF_ALREADY_REVIEWED');
      const [decision] = await Review.create([{
        warehouseId, paymentId: payment._id, proofId: proof._id, decision: body.decision,
        reason, reviewedBy: actorId, at: new Date(), idempotencyKey: key, fingerprint,
      }], { session });
      await audit.record({ action: body.decision === 'approved' ? 'payment.proof_approved' : 'payment.proof_rejected',
        actorId, actorRole: 'warehouse', entityType: 'PaymentProofReview', entityId: decision._id,
        accountId: payment.accountId, ledgerEntryIds: [payment.ledgerEntryId], reason, idempotencyKey: key,
        after: { proofId: proof._id, paymentId: payment._id, decision: body.decision },
      }, session);
      return { record: decision.toObject(), replay: false };
    });
  } catch (err) {
    if (err?.code === 11000 && warehouseId) {
      return runInTransaction(async session => {
        const current = await scope(actorId, 'paymentProofReview', session);
        const existing = await replay(Review, current.warehouseId, key, fingerprint, session);
        if (existing) return existing;
        throw err;
      });
    }
    throw err;
  }
}

async function list(actorId, paymentId, { before = null } = {}) {
  paymentId = objectId(paymentId);
  if (before !== null && (!Number.isSafeInteger(before) || before <= 0)) throw invalid();
  return financialReadSnapshot(async session => {
    const { warehouseId } = await scope(actorId, 'financialRead', session);
    const payment = await Payment.findOne({ _id: paymentId, warehouseId }).select('status kind paidAt').session(session).lean();
    if (!payment || payment.kind !== 'settlement') throw missing();
    const page = await Proof.find({ paymentId, warehouseId, ...(before === null ? {} : { revision: { $lt: before } }) })
      .sort({ revision: -1 }).limit(51).session(session).lean();
    const proofs = page.slice(0, 50);
    const reviews = proofs.length ? await Review.find({ warehouseId, proofId: { $in: proofs.map(p => p._id) } }).session(session).lean() : [];
    const byId = new Map(reviews.map(r => [String(r.proofId), r]));
    return { paymentId: String(paymentId), paymentStatus: payment.status, paidAt: payment.paidAt, asOf: new Date(),
      hasMore: page.length > 50, nextBefore: page.length > 50 ? proofs[proofs.length - 1].revision : null,
      rows: proofs.map(proof => ({ ...proof, review: byId.get(String(proof._id)) ?? null,
        effectiveApproval: payment.status === 'posted' && byId.get(String(proof._id))?.decision === 'approved',
      })),
    };
  });
}

module.exports = { submit, review, list };
