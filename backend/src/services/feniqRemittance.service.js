const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { requestFingerprint, idempotencyKeyReusedError } = require('../utils/idempotency');
const { authorizePersistedCollectionAction } = require('../utils/collectionActorAuthorization');
const { ACTIONS } = require('../utils/collectionActorPolicy');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const CollectionActorGrant = require('../models/collectionActorGrant.model');
const Custody = require('../models/feniqCashCustody.model');
const Receipt = require('../models/feniqCollectionReceipt.model');
const Account = require('../models/ledgerAccount.model');
const { Reconciliation, Remittance, Withholding } = require('../models/feniqRemittance.model');
const ledger = require('./ledger.service');
const audit = require('./financialAudit.service');
const calculation = require('./feniqCustodyCalculation.service');
const { warehouseForUserFilter } = require('../utils/loadWarehouse');
function invalid() { return ApiError.badRequest('Invalid custody operation.', undefined, 'INVALID_CUSTODY_OPERATION'); }
function id(value) { if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw invalid(); return value.toLowerCase(); }
function text(value, required = true) {
  if (!required && value == null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw invalid();
  return value.trim();
}
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k))) throw invalid();
}
function gate() {
  if (process.env.FENIQ_COLLECTION_RECEIPTS_ENABLED !== 'true') throw ApiError.forbidden('Feniq collections are disabled.', 'FENIQ_COLLECTION_WRITER_DISABLED');
}
async function authorize(actorId, warehouseId, action, session, recordedBy) {
  if (!await authorizePersistedCollectionAction({ actorId, warehouseId, action, recordedBy,
    User, Warehouse, CollectionActorGrant, session, forMoneyPost: true })) {
    throw ApiError.forbidden('An explicit independent collection grant is required.', 'FENIQ_COLLECTION_GRANT_REQUIRED');
  }
}
async function init() { await Promise.all([Reconciliation.createIndexes(), Remittance.createIndexes(), Withholding.createIndexes()]); }
async function lock(warehouseId, session) {
  const warehouse = await Warehouse.findOneAndUpdate({ _id: warehouseId, isActive: true },
    { $inc: { collectionCustodyRevision: 1 } }, { session, new: true }).lean();
  if (!warehouse) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
  const accounts = await Custody.distinct('accountId', { warehouseId }).session(session);
  for (const accountId of accounts.sort((a, b) => String(a).localeCompare(String(b)))) {
    await ledger.lockAccountForFinancialChange(accountId, warehouseId, session);
  }
}
async function readScope(actorId, warehouseId, session) {
  const actor = await User.findById(actorId).select('role status warehouseRole').session(session).lean();
  if (!actor || actor.status !== 'active' || !['admin', 'warehouse'].includes(actor.role)) throw ApiError.forbidden('Financial reader required.');
  const warehouse = await Warehouse.findOne({ _id: warehouseId,
    ...(actor.role === 'warehouse' ? warehouseForUserFilter(actor._id) : {}),
  }).session(session).lean();
  if (!warehouse) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
  return actor;
}
async function retry(work) {
  try { return await runInTransaction(work); }
  catch (error) { if (error.code !== 11000) throw error; return runInTransaction(work); }
}
function replay(row, fingerprint) {
  if (row.fingerprint !== fingerprint) throw idempotencyKeyReusedError('Key belongs to a different custody operation.');
  return { ...row, replay: true };
}
// Immutable calculations, including blocked attempts. Mutable custody fields
// are only a current projection; historical snapshots/transfers never change.
async function persist(actorId, warehouseId, key, fingerprint, session) {
  const previous = await Reconciliation.findOne({ warehouseId, idempotencyKey: key }).session(session).lean();
  if (previous) return replay(previous, fingerprint);
  const { result, sourceHash } = await calculation.calculate(warehouseId, session);
  const [created] = await Reconciliation.create([{ warehouseId, actorId, at: new Date(),
    idempotencyKey: key, fingerprint, sourceHash, result }], { session });
  for (const custodyId of result.custodyIds) {
    const row = result.accounts.flatMap(a => a.rows).find(r => String(r.custodyId) === String(custodyId));
    await Custody.updateOne({ _id: custodyId, warehouseId, status: { $ne: 'remitted' } }, { $set: {
      reconciliationId: created._id, reconciliationReasons: result.blockers.map(b => b.code),
      netWarehouseDueSyp: result.ready ? row.netWarehouseDueSyp : null,
      status: result.ready ? 'remittance_pending' : 'awaiting_reconciliation',
    } }, { session });
  }
  for (const account of result.accounts.filter(a => a.commissionReady)) {
    const history = await Withholding.find({ warehouseId, accountId: account.accountId }).session(session).lean();
    const targets = new Map(history.map(h => [String(h.invoiceId), 0]));
    for (const allocation of account.rows.flatMap(r => r.allocations)) {
      const key = String(allocation.invoiceId);
      targets.set(key, calculation.sum([targets.get(key) || 0, allocation.feniqSyp]));
    }
    for (const [invoiceId, targetSyp] of targets) {
      const amountSyp = calculation.sum([targetSyp, -calculation.sum(history.filter(h => String(h.invoiceId) === invoiceId).map(h => h.amountSyp))]);
      if (amountSyp) await Withholding.create([{ warehouseId, accountId: account.accountId, invoiceId,
        allocationRunId: account.allocationRunId, reconciliationId: created._id, amountSyp, targetSyp, at: account.allocationAt,
      }], { session });
    }
  }
  const actor = await User.findById(actorId).select('role').session(session).lean();
  await audit.record({ action: 'collection.custody_reconciled', actorId, actorRole: actor?.role,
    onBehalfOfWarehouseId: warehouseId, entityType: 'FeniqCustodyReconciliation', entityId: created._id,
    idempotencyKey: key, after: { ready: result.ready, sourceHash, netWarehouseDueSyp: result.netWarehouseDueSyp, blockers: result.blockers },
  }, session);
  return { ...created.toObject(), replay: false };
}
async function reconcile(actorId, warehouseId, body) {
  gate(); warehouseId = id(warehouseId); fields(body, ['idempotencyKey']);
  const key = text(body.idempotencyKey);
  const fingerprint = requestFingerprint('feniq-reconcile-v1', { actorId: String(actorId), warehouseId });
  await init();
  return retry(async session => {
    await authorize(actorId, warehouseId, ACTIONS.RECORD_REMITTANCE, session);
    await lock(warehouseId, session);
    return persist(actorId, warehouseId, key, fingerprint, session);
  });
}

async function record(actorId, warehouseId, body, originalId = null) {
  gate(); warehouseId = id(warehouseId); if (originalId) originalId = id(originalId);
  fields(body, originalId ? ['amountSyp', 'transferredAt', 'reference', 'reason', 'idempotencyKey']
    : ['amountSyp', 'transferredAt', 'reference', 'reconciliationId', 'idempotencyKey']);
  const key = text(body.idempotencyKey), reference = text(body.reference);
  const reason = originalId ? text(body.reason) : null;
  const reconciliationId = originalId ? null : id(body.reconciliationId);
  const transferredAt = require('./feniqReceipt.service').receiptDate(body.transferredAt);
  if (!Number.isSafeInteger(body.amountSyp) || body.amountSyp <= 0) throw invalid();
  const kind = originalId ? 'reversal' : 'transfer';
  const fingerprint = requestFingerprint('feniq-remittance-v1', { actorId: String(actorId), warehouseId,
    kind, originalId, reconciliationId, amountSyp: body.amountSyp, transferredAt: transferredAt.toISOString(), reference, reason });
  await init();
  return retry(async session => {
    await authorize(actorId, warehouseId, originalId ? ACTIONS.REVERSE_REMITTANCE : ACTIONS.RECORD_REMITTANCE, session);
    await lock(warehouseId, session);
    const existing = await Remittance.findOne({ warehouseId, idempotencyKey: key }).session(session).lean();
    if (existing) return replay(existing, fingerprint);
    if (await Remittance.exists({ warehouseId, status: 'pending' }).session(session)) throw ApiError.conflict('A cash movement is awaiting an independent decision.', 'REMITTANCE_PENDING');
    let sourceHash = null, custodyIds;
    if (originalId) {
      const original = await Remittance.findOne({ _id: originalId, warehouseId, kind: 'transfer', status: 'confirmed' }).session(session).lean();
      if (!original || body.amountSyp !== original.amountSyp || transferredAt < original.transferredAt) throw ApiError.conflict('Reversal must reference the confirmed original amount and actual cash return.', 'INVALID_REMITTANCE_REVERSAL');
      custodyIds = original.custodyIds;
    } else {
      const snapshot = await Reconciliation.findOne({ _id: reconciliationId, warehouseId }).session(session).lean();
      const current = await calculation.calculate(warehouseId, session);
      if (!snapshot || !current.result.ready || snapshot.sourceHash !== current.sourceHash) throw ApiError.conflict('Reconcile current sources before recording a transfer.', 'CUSTODY_RECONCILIATION_CHANGED');
      if (current.result.netWarehouseDueSyp !== body.amountSyp) throw ApiError.conflict('Transfer must equal the verified remaining warehouse liability.', 'REMITTANCE_AMOUNT_MISMATCH');
      sourceHash = current.sourceHash;
      const rows = await Custody.find({ warehouseId, status: { $ne: 'remitted' } }).session(session).lean();
      if (rows.some(c => transferredAt < c.actualReceivedAt)) throw invalid();
      custodyIds = rows.map(c => c._id);
    }
    const [movement] = await Remittance.create([{ warehouseId, recordedBy: actorId, kind, originalId, reconciliationId,
      sourceHash, custodyIds, amountSyp: body.amountSyp, transferredAt, reference, reason,
      recordedAt: new Date(), idempotencyKey: key, fingerprint, status: 'pending' }], { session });
    await audit.record({ action: originalId ? 'collection.remittance_reversal_submitted' : 'collection.remittance_submitted',
      actorId, actorRole: 'admin', onBehalfOfWarehouseId: warehouseId, entityType: 'FeniqRemittance',
      entityId: movement._id, idempotencyKey: key, reason, after: { kind, amountSyp: body.amountSyp, reference, transferredAt, originalId, reconciliationId } }, session);
    return { ...movement.toObject(), replay: false };
  });
}

async function review(actorId, warehouseId, movementId, body) {
  gate(); warehouseId = id(warehouseId); movementId = id(movementId);
  fields(body, ['decision', 'reason', 'idempotencyKey']);
  if (!['confirmed', 'rejected'].includes(body.decision)) throw invalid();
  const key = text(body.idempotencyKey), reason = text(body.reason, true);
  const fingerprint = requestFingerprint('feniq-remittance-review-v1', { actorId: String(actorId), warehouseId, movementId, decision: body.decision, reason });
  await init();
  return retry(async session => {
    const movement = await Remittance.findOne({ _id: movementId, warehouseId }).session(session).lean();
    if (!movement) throw ApiError.notFound('Remittance not found.', 'REMITTANCE_NOT_FOUND');
    await authorize(actorId, warehouseId, ACTIONS.CONFIRM_REMITTANCE, session, movement.recordedBy);
    await lock(warehouseId, session);
    const used = await Remittance.findOne({ warehouseId, decisionKey: key }).session(session).lean();
    if (used && String(used._id) !== movementId) throw idempotencyKeyReusedError('Decision key belongs to another remittance.');
    if (movement.status !== 'pending') {
      if (movement.decisionKey !== key || movement.decisionFingerprint !== fingerprint) throw ApiError.conflict('Movement already decided.', 'REMITTANCE_REVIEWED');
      return { ...movement, replay: true };
    }
    if (body.decision === 'confirmed') {
      if (movement.kind === 'transfer') {
        const current = await calculation.calculate(warehouseId, session);
        if (!current.result.ready || current.sourceHash !== movement.sourceHash || current.result.netWarehouseDueSyp !== movement.amountSyp) throw ApiError.conflict('Financial sources changed; reject this evidence and reconcile again.', 'CUSTODY_RECONCILIATION_CHANGED');
      } else {
        const original = await Remittance.findOne({ _id: movement.originalId, warehouseId, kind: 'transfer', status: 'confirmed' }).session(session).lean();
        if (!original || original.amountSyp !== movement.amountSyp) throw ApiError.conflict('Original transfer is not reversible.', 'INVALID_REMITTANCE_REVERSAL');
        await Remittance.updateOne({ _id: original._id, warehouseId, status: 'confirmed' }, { $set: { status: 'reversed' } }, { session });
      }
      await Custody.updateMany({ _id: { $in: movement.custodyIds }, warehouseId }, { $set: {
        status: movement.kind === 'transfer' ? 'remitted' : 'remittance_pending',
      } }, { session });
    }
    const updated = await Remittance.findOneAndUpdate({ _id: movementId, warehouseId, status: 'pending' }, { $set: {
      status: body.decision, decision: body.decision, reviewedBy: actorId, reviewedAt: new Date(),
      decisionKey: key, decisionFingerprint: fingerprint, decisionReason: reason,
    } }, { session, new: true }).lean();
    if (!updated) throw ApiError.conflict('Movement changed concurrently.', 'REMITTANCE_REVIEWED');
    await audit.record({ action: body.decision === 'rejected' ? 'collection.remittance_rejected'
      : movement.kind === 'reversal' ? 'collection.remittance_reversed' : 'collection.remittance_confirmed',
    actorId, actorRole: 'warehouse', onBehalfOfWarehouseId: warehouseId, entityType: 'FeniqRemittance',
    entityId: movement._id, reason, idempotencyKey: key,
    before: { status: 'pending' }, after: { status: body.decision, amountSyp: movement.amountSyp, originalId: movement.originalId } }, session);
    await persist(actorId, warehouseId, 'decision:' + movementId, fingerprint, session);
    return { ...updated, replay: false };
  });
}

async function read(actorId, warehouseId, query = {}) {
  warehouseId = id(warehouseId);
  if (Object.keys(query).some(k => !['before', 'receiptBefore', 'custodyBefore'].includes(k))) throw invalid();
  const before = query.before ? id(query.before) : null;
  const receiptBefore = query.receiptBefore ? id(query.receiptBefore) : null;
  const custodyBefore = query.custodyBefore ? id(query.custodyBefore) : null;
  return runInTransaction(async session => {
    const actor = await readScope(actorId, warehouseId, session);
    const current = await calculation.calculate(warehouseId, session);
    const latest = await Reconciliation.findOne({ warehouseId }).sort({ _id: -1 }).session(session).lean();
    const movements = await Remittance.find({ warehouseId, ...(before ? { _id: { $lt: before } } : {}) }).sort({ _id: -1 }).limit(51).session(session).lean();
    const custody = await Custody.find({ warehouseId, status: { $ne: 'remitted' }, ...(custodyBefore ? { _id: { $lt: custodyBefore } } : {}) }).sort({ _id: -1 }).limit(101).session(session).lean();
    const now = new Date();
    const permissions = {};
    for (const action of [ACTIONS.RECORD_FENIQ, ACTIONS.RECORD_REMITTANCE, ACTIONS.REVERSE_REMITTANCE, ACTIONS.CONFIRM_REMITTANCE]) {
      // Read-only checks never touch authorizationRevision.
      permissions[action] = await authorizePersistedCollectionAction({ actorId, warehouseId, action,
        recordedBy: movements[0]?.recordedBy ?? actorId, User, Warehouse, CollectionActorGrant, session });
    }
    const warehouse = await Warehouse.findById(warehouseId).session(session).lean();
    const receiptRows = await Receipt.find({ warehouseId, ...(receiptBefore ? { _id: { $lt: receiptBefore } } : {}) }).sort({ _id: -1 }).limit(51).session(session).lean();
    const receiptPage = [];
    for (const receipt of receiptRows.slice(0, 50)) {
      const canReview = receipt.status === 'pending' && await authorizePersistedCollectionAction({ actorId, warehouseId,
        action: ACTIONS.APPROVE_FENIQ, recordedBy: receipt.recordedBy, User, Warehouse, CollectionActorGrant, session });
      receiptPage.push({ id: receipt._id, pharmacyId: receipt.pharmacyId, amountSyp: receipt.amountSyp,
        actualReceivedAt: receipt.actualReceivedAt, reference: receipt.reference, status: receipt.status,
        paymentId: receipt.paymentId, recordedBy: receipt.recordedBy, canReview });
    }
    const pharmacyAccounts = await Account.find({ warehouseId }).select('pharmacyId').limit(200)
      .populate('pharmacyId', 'nameAr nameEn').session(session).lean();
    const grantActors = actor.role === 'admin' ? await User.find({ status: 'active', $or: [{ role: 'admin' },
      { role: 'warehouse', warehouseRole: 'accountant', _id: { $in: [warehouse.userId, ...(warehouse.memberUserIds || [])] } }] })
      .select('name role warehouseRole').sort({ name: 1 }).limit(200).session(session).lean() : [];
    const actorGrants = actor.role === 'admin' ? await CollectionActorGrant.find({ warehouseId }).select('actorId action active grantReason')
      .limit(200).session(session).lean() : [];
    return { warehouseId, asOf: now, writerEnabled: process.env.FENIQ_COLLECTION_RECEIPTS_ENABLED === 'true',
      receipts: receiptPage, receiptsTruncated: receiptRows.length > 50, nextReceiptBefore: receiptRows.length > 50 ? receiptRows[49]._id : null,
      pharmacies: pharmacyAccounts.map(a => a.pharmacyId).filter(Boolean), grantActors, actorGrants,
      summary: current.result, reconciliation: latest, reconciliationCurrent: latest?.sourceHash === current.sourceHash,
      permissions, role: actor.role, movements: movements.slice(0, 50), hasMore: movements.length > 50,
      nextBefore: movements.length > 50 ? movements[49]._id : null,
      custody: custody.slice(0, 100).map(c => ({ ...c,
        targetMissed: now >= c.targetRemittanceAt, overdue: now >= c.deadlineAt })), custodyTruncated: custody.length > 100, nextCustodyBefore: custody.length > 100 ? custody[99]._id : null };
  });
}
async function readSnapshot(actorId, warehouseId, snapshotId) {
  warehouseId = id(warehouseId); snapshotId = id(snapshotId);
  return runInTransaction(async session => {
    await readScope(actorId, warehouseId, session);
    const snapshot = await Reconciliation.findOne({ _id: snapshotId, warehouseId }).session(session).lean();
    if (!snapshot) throw ApiError.notFound('Reconciliation not found.', 'RECONCILIATION_NOT_FOUND');
    return snapshot;
  });
}
module.exports = { reconcile, record, review, read, readSnapshot, persist, lock };
