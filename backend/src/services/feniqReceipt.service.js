'use strict';
const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { requestFingerprint, idempotencyKeyReusedError } = require('../utils/idempotency');
const { ACTIONS } = require('../utils/collectionActorPolicy');
const { authorizePersistedCollectionAction } = require('../utils/collectionActorAuthorization');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Pharmacy = require('../models/pharmacy.model');
const Grant = require('../models/collectionActorGrant.model');
const Receipt = require('../models/feniqCollectionReceipt.model');
const Custody = require('../models/feniqCashCustody.model');
const { Recognition } = require('../models/collectionAccounting.model');
const paymentService = require('./payment.service');
const ledger = require('./ledger.service');
const audit = require('./financialAudit.service');
const { captureFxSnapshot } = require('./exchangeRate.service');

const HEX_ID = /^[a-f0-9]{24}$/i;
function id(value) {
  if (typeof value !== 'string' || !HEX_ID.test(value)) {
    throw ApiError.badRequest('Invalid collection identifier.', undefined, 'INVALID_FENIQ_RECEIPT');
  }
  return value.toLowerCase();
}
function text(value, max, required = false) {
  if (!required && (value == null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw ApiError.badRequest('Invalid collection evidence field.', undefined, 'INVALID_FENIQ_RECEIPT');
  }
  return value.trim();
}
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !allowed.includes(k))) {
    throw ApiError.badRequest('Invalid collection receipt request.', undefined, 'INVALID_FENIQ_RECEIPT');
  }
}
function receiptDate(value) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw ApiError.badRequest('Actual collection time with timezone required.', undefined, 'ACTUAL_CASH_TIME_REQUIRED');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60 * 1000) {
    throw ApiError.badRequest('Invalid actual cash time.', undefined, 'INVALID_ACTUAL_CASH_TIME');
  }
  return date;
}
function enabled() {
  // Default OFF even after a merge/deploy. Only dedicated isolated staging
  // acceptance may enable the writer; production activation is a separate decision.
  if (process.env.FENIQ_COLLECTION_RECEIPTS_ENABLED !== 'true') {
    throw ApiError.forbidden('Feniq collection posting is not activated.', 'FENIQ_COLLECTION_WRITER_DISABLED');
  }
}
function publicRow(r) {
  return { id: r._id, warehouseId: r.warehouseId, pharmacyId: r.pharmacyId,
    recordedBy: r.recordedBy, amountSyp: r.amountSyp, actualReceivedAt: r.actualReceivedAt,
    reference: r.reference, status: r.status, reviewedBy: r.reviewedBy || null,
    reviewedAt: r.reviewedAt || null, paymentId: r.paymentId || null };
}
async function scope(actorId, warehouseId, action, session, recordedBy) {
  const authorized = await authorizePersistedCollectionAction({
    actorId, warehouseId, action, recordedBy,
    User, Warehouse, CollectionActorGrant: Grant, session,
  });
  if (!authorized) {
    throw ApiError.forbidden('An explicit active collection grant is required.',
      'FENIQ_COLLECTION_GRANT_REQUIRED');
  }
  const warehouse = await Warehouse.findById(warehouseId)
    .select('commissionEngine collectionContractId isActive').session(session).lean();
  if (!warehouse || warehouse.commissionEngine !== 'collection_v2' ||
      !warehouse.collectionContractId) {
    throw ApiError.conflict('An active collection-v2 contract is required.',
      'FENIQ_COLLECTION_CONTRACT_REQUIRED');
  }
}
function decisionFingerprint(actorId, warehouseId, receiptId, decision, reason) {
  return requestFingerprint('feniq-receipt-review-v1',
    { actorId: String(actorId), warehouseId, receiptId, decision, reason });
}
function replayDecision(row, key, fingerprint) {
  if (row.decisionKey !== key || row.decisionFingerprint !== fingerprint) {
    throw ApiError.conflict('Receipt already has an immutable decision.', 'FENIQ_RECEIPT_REVIEWED');
  }
  return { receipt: publicRow(row), replay: true };
}

async function record(actorId, warehouseId, body) {
  enabled();
  warehouseId = id(warehouseId);
  fields(body, ['pharmacyId', 'amountSyp', 'actualReceivedAt', 'reference', 'note', 'idempotencyKey']);
  const pharmacyId = id(body.pharmacyId);
  const amountSyp = body.amountSyp;
  if (!Number.isSafeInteger(amountSyp) || amountSyp <= 0) {
    throw ApiError.badRequest('Amount must be positive whole Syrian pounds.', undefined, 'INVALID_FENIQ_RECEIPT_AMOUNT');
  }
  const actualReceivedAt = receiptDate(body.actualReceivedAt);
  const reference = text(body.reference, 500, true);
  const note = text(body.note, 1000);
  const key = text(body.idempotencyKey, 100, true);
  const fingerprint = requestFingerprint('feniq-cash-record-v1', {
    actorId: String(actorId), warehouseId, pharmacyId, amountSyp,
    actualReceivedAt: actualReceivedAt.toISOString(), reference, note,
  });
  // An uncertain network reply must still replay even if FX changed or the
  // provider is temporarily down after the original submission committed.
  const existing = await runInTransaction(async session => {
    await scope(actorId, warehouseId, ACTIONS.RECORD_FENIQ, session);
    return replay(session);
  });
  if (existing) return existing;
  const fx = await captureFxSnapshot();
  if (!fx || !Number.isFinite(fx.rate) || fx.rate <= 0) {
    throw ApiError.badRequest('Cash evidence requires a frozen FX reference.', undefined, 'EXCHANGE_RATE_UNAVAILABLE');
  }
  const frozen = paymentService.freezeAmounts(amountSyp, 'SYP', fx);
  async function replay(session) {
    const previous = await Receipt.findOne({ warehouseId, idempotencyKey: key }).session(session).lean();
    if (!previous) return null;
    if (previous.fingerprint !== fingerprint) {
      throw idempotencyKeyReusedError('This key identifies a different collection.');
    }
    return { receipt: publicRow(previous), replay: true };
  }
  try {
    return await runInTransaction(async session => {
      await scope(actorId, warehouseId, ACTIONS.RECORD_FENIQ, session);
      const existing = await replay(session);
      if (existing) return existing;
      const pharmacy = await Pharmacy.findById(pharmacyId).select('_id').session(session).lean();
      if (!pharmacy) throw ApiError.notFound('Pharmacy not found.', 'PHARMACY_NOT_FOUND');
      const [receipt] = await Receipt.create([{
        warehouseId, pharmacyId, recordedBy: actorId, amountSyp, amountUsd: frozen.amountUsd,
        fx, actualReceivedAt, recordedAt: new Date(), reference, note,
        idempotencyKey: key, fingerprint, status: 'pending',
      }], { session });
      await audit.record({ action: 'collection.receipt_submitted', actorId, actorRole: 'admin',
        onBehalfOfWarehouseId: warehouseId, entityType: 'FeniqCollectionReceipt',
        entityId: receipt._id, idempotencyKey: key,
        after: { pharmacyId, amountSyp, actualReceivedAt, status: 'pending' },
      }, session);
      return { receipt: publicRow(receipt), replay: false };
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return runInTransaction(async session => {
      await scope(actorId, warehouseId, ACTIONS.RECORD_FENIQ, session);
      const previous = await replay(session);
      if (previous) return previous;
      throw idempotencyKeyReusedError('Collection key already used.');
    });
  }
}

async function review(actorId, warehouseId, receiptId, body) {
  enabled();
  warehouseId = id(warehouseId); receiptId = id(receiptId);
  fields(body, ['decision', 'reason', 'idempotencyKey']);
  const decision = body.decision;
  if (!['approved', 'rejected'].includes(decision)) {
    throw ApiError.badRequest('Invalid receipt decision.', undefined, 'INVALID_FENIQ_RECEIPT');
  }
  const reason = text(body.reason, 1000, decision === 'rejected');
  const key = text(body.idempotencyKey, 100, true);
  const fingerprint = decisionFingerprint(actorId, warehouseId, receiptId, decision, reason);
  const read = async session => {
    const r = await Receipt.findOne({ _id: receiptId, warehouseId }).session(session).lean();
    if (!r) throw ApiError.notFound('Collection receipt not found.', 'FENIQ_RECEIPT_NOT_FOUND');
    await scope(actorId, warehouseId, ACTIONS.APPROVE_FENIQ, session, r.recordedBy);
    return r;
  };
  if (decision === 'rejected') {
    return runInTransaction(async session => {
      const receipt = await read(session);
      if (receipt.status !== 'pending') return replayDecision(receipt, key, fingerprint);
      const updated = await Receipt.findOneAndUpdate({ _id: receiptId, warehouseId, status: 'pending' },
        { $set: { status: 'rejected', reviewedBy: actorId, reviewedAt: new Date(),
          decisionKey: key, decisionFingerprint: fingerprint, rejectionReason: reason } },
        { session, new: true }).lean();
      if (!updated) throw ApiError.conflict('Receipt was reviewed concurrently.', 'FENIQ_RECEIPT_REVIEWED');
      await audit.record({ action: 'collection.receipt_rejected', actorId, actorRole: 'admin',
        onBehalfOfWarehouseId: warehouseId, entityType: 'FeniqCollectionReceipt',
        entityId: receiptId, reason, idempotencyKey: key,
        before: { status: 'pending' }, after: { status: 'rejected' },
      }, session);
      return { receipt: publicRow(updated), replay: false };
    });
  }

  // Preflight is read-only. All authorization and the status compare-and-swap
  // are REPEATED in the canonical payment transaction before any ledger post.
  const original = await runInTransaction(read);
  if (original.status !== 'pending') return replayDecision(original, key, fingerprint);
  const payment = await paymentService.createPayment(warehouseId, original.recordedBy, {
    pharmacyId: String(original.pharmacyId), amount: original.amountSyp,
    currency: 'SYP', method: 'cash', paidAt: original.actualReceivedAt,
    reference: original.reference, note: original.note,
    idempotencyKey: 'feniq-approved-' + receiptId,
  }, {
    fxSnapshot: original.fx, actorRole: 'admin', postingActorId: actorId,
    beforePost: async session => {
      const receipt = await read(session);
      if (receipt.status !== 'pending') throw ApiError.conflict('Receipt already reviewed.', 'FENIQ_RECEIPT_REVIEWED');
      const claimed = await Receipt.findOneAndUpdate({ _id: receiptId, warehouseId, status: 'pending' },
        { $set: { status: 'approved', reviewedBy: actorId, reviewedAt: new Date(),
          decisionKey: key, decisionFingerprint: fingerprint } },
        { session, new: true }).lean();
      if (!claimed) throw ApiError.conflict('Receipt was reviewed concurrently.', 'FENIQ_RECEIPT_REVIEWED');
    },
    afterPost: async (session, posted) => {
      const update = await Receipt.updateOne({ _id: receiptId, warehouseId,
        status: 'approved', paymentId: null }, { $set: { paymentId: posted._id } }, { session });
      if (update.matchedCount !== 1) throw new Error('Approved Feniq receipt payment link missing.');
      // This is the authorization evidence that earns commission. It is not
      // another pharmacy payment or a warehouse's proof+weekly settlement.
      await Recognition.create([{
        paymentId: posted._id, accountId: posted.accountId, warehouseId, collector: 'feniq',
        actorId, at: new Date(),
      }], { session });
      await require('./collectionLedger.service').rebuildAccount({
        accountId: posted.accountId, warehouseId, actorId,
        sourceKey: 'feniq-approval:' + receiptId, reason: 'Approved actual Feniq cash receipt',
      }, session);
      const receivedAt = new Date(original.actualReceivedAt);
      const [custody] = await Custody.create([{
        receiptId, paymentId: posted._id, warehouseId, accountId: posted.accountId,
        grossHeldSyp: posted.amountSyp, actualReceivedAt: receivedAt,
        targetRemittanceAt: new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000),
        deadlineAt: new Date(receivedAt.getTime() + 48 * 60 * 60 * 1000),
        status: 'awaiting_reconciliation',
      }], { session });
      await audit.record({ action: 'collection.receipt_approved', actorId, actorRole: 'admin',
        onBehalfOfWarehouseId: warehouseId, entityType: 'FeniqCollectionReceipt', entityId: receiptId,
        accountId: posted.accountId, ledgerEntryIds: [posted.ledgerEntryId],
        idempotencyKey: key, before: { status: 'pending' },
        after: { status: 'approved', paymentId: posted._id, amountSyp: posted.amountSyp },
      }, session);
      await audit.record({ action: 'collection.custody_opened', actorId, actorRole: 'admin',
        onBehalfOfWarehouseId: warehouseId, entityType: 'FeniqCashCustody', entityId: custody._id,
        accountId: posted.accountId, idempotencyKey: key,
        after: { grossHeldSyp: posted.amountSyp, deadlineAt: custody.deadlineAt,
          status: 'awaiting_reconciliation' },
      }, session);
    },
  });
  // A concurrent approval with another request key may have replayed the
  // deterministic Payment. Never claim success for somebody else's decision.
  const committed = await runInTransaction(read);
  if (committed.status !== 'approved' || String(committed.paymentId) !== String(payment._id)) {
    throw ApiError.conflict('Receipt has no matching committed payment.', 'FENIQ_RECEIPT_REVIEWED');
  }
  if (committed.decisionKey !== key || committed.decisionFingerprint !== fingerprint) {
    throw ApiError.conflict('Another approval was already committed.', 'FENIQ_RECEIPT_REVIEWED');
  }
  return { receipt: publicRow(committed), replay: Boolean(payment.$locals?.idempotentReplay) };
}

async function list(actorId, warehouseId, { before = null } = {}) {
  warehouseId = id(warehouseId);
  if (before !== null) before = id(before);
  return runInTransaction(async session => {
    const actor = await User.findById(actorId).select('role status').session(session).lean();
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') {
      throw ApiError.forbidden('Active platform administrator required.', 'ACTIVE_ADMIN_REQUIRED');
    }
    const warehouse = await Warehouse.findById(warehouseId).select('_id').session(session).lean();
    if (!warehouse) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
    const rows = await Receipt.find({ warehouseId, ...(before ? { _id: { $lt: before } } : {}) })
      .sort({ _id: -1 }).limit(51).session(session).lean();
    return { rows: rows.slice(0, 50).map(publicRow), hasMore: rows.length > 50,
      nextBefore: rows.length > 50 ? rows[49]._id : null };
  });
}

module.exports = { record, review, list, receiptDate };
