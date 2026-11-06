const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { rolePermissions } = require('../utils/rolePermissions');
const { requestFingerprint, idempotencyKeyReusedError } = require('../utils/idempotency');
const { runInTransaction } = require('../utils/transaction');
const { POLICY_VERSION } = require('../utils/collectionAccountingPolicy');
const { parseRepCommissionRate } = require('../utils/repCommission');
const Contract = require('../models/collectionContract.model');
const Warehouse = require('../models/warehouse.model');
const Rep = require('../models/rep.model');
const User = require('../models/user.model');
const audit = require('./financialAudit.service');

const invalid = () => ApiError.badRequest('Invalid collection contract.', undefined, 'INVALID_COLLECTION_CONTRACT');
const changed = () => ApiError.conflict('The collection contract changed. Refresh and retry.', 'COLLECTION_CONTRACT_CHANGED');
function id(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw invalid();
  return new mongoose.Types.ObjectId(value).toHexString();
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
  return value.trim();
}

// Captures rates already agreed through the warehouse's rep settings. This API
// cannot introduce a new percentage or backdate a version onto old invoices.
// Calling it is an explicit new-contract activation, never a boot migration.
async function createAndActivate(actorId, warehouseId, body) {
  actorId = id(actorId); warehouseId = id(warehouseId);
  if (!body || Array.isArray(body) || Object.keys(body).some(k => !['agreementReference', 'basis', 'deliveryFeeSyp', 'expectedRevision', 'idempotencyKey'].includes(k))) throw invalid();
  const agreementReference = text(body.agreementReference, 500);
  const key = text(body.idempotencyKey, 100);
  if (body.basis !== 'net_pharmacy_invoice' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 ||
      !Object.hasOwn(body, 'deliveryFeeSyp') || (body.deliveryFeeSyp !== null && (!Number.isSafeInteger(body.deliveryFeeSyp) || body.deliveryFeeSyp < 0))) throw invalid();
  const fingerprint = requestFingerprint('collection-contract-v1', { actorId, warehouseId,
    agreementReference, basis: body.basis, deliveryFeeSyp: body.deliveryFeeSyp, expectedRevision: body.expectedRevision });
  // Unique indexes must exist before entering the transaction, including for
  // an isolated programmatic caller that did not start the HTTP server.
  await Contract.createIndexes();
  const work = async session => {
    const actor = await User.findById(actorId).select('role status').session(session).lean();
    if (!rolePermissions(actor).platformManage) throw ApiError.forbidden('Contract administration requires an active administrator.');
    const previous = await Contract.findOne({ warehouseId, idempotencyKey: key }).session(session).lean();
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw idempotencyKeyReusedError('The contract key identifies different terms.');
      return { contract: previous, replay: true };
    }
    const warehouse = await Warehouse.findById(warehouseId).session(session).lean();
    if (!warehouse) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
    const revision = warehouse.collectionContractRevision ?? 0;
    if (revision !== body.expectedRevision) throw changed();
    // An old, separate platform charge is not silently erased or folded into
    // the rep commission. Resolve its contract before using this engine.
    if (Number(warehouse.commissionRate ?? 0) !== 0) {
      throw ApiError.conflict('The legacy standalone commission must be reconciled before this contract is selected.', 'LEGACY_COMMISSION_CONTRACT_CONFLICT');
    }
    const reps = await Rep.find({ warehouseId, isActive: true }).select('_id commissionRate').sort({ _id: 1 }).session(session).lean();
    const repRates = reps.map(rep => {
      const rate = parseRepCommissionRate(rep.commissionRate);
      if (rate === null) throw invalid();
      return { repId: rep._id, rateBps: Math.round(rate * 100) };
    });
    const [contract] = await Contract.create([{
      warehouseId, revision: revision + 1, policyVersion: POLICY_VERSION,
      agreementReference, basis: body.basis, repRates, deliveryFeeSyp: body.deliveryFeeSyp,
      approvedBy: actorId, approvedAt: new Date(), idempotencyKey: key, fingerprint,
    }], { session });
    const selected = await Warehouse.updateOne({ _id: warehouseId,
      $or: [{ collectionContractRevision: revision }, ...(revision === 0 ? [{ collectionContractRevision: { $exists: false } }] : [])],
    }, { $set: { commissionEngine: 'collection_v2', collectionContractId: contract._id, collectionContractRevision: contract.revision } }, { session });
    if (selected.matchedCount !== 1) throw changed();
    await audit.record({ action: 'commission.contract_activated', actorId, actorRole: 'admin',
      entityType: 'CollectionContract', entityId: contract._id, onBehalfOfWarehouseId: warehouseId,
      idempotencyKey: key, reason: agreementReference,
      after: { policyVersion: POLICY_VERSION, revision: contract.revision, contractId: contract._id },
    }, session);
    return { contract: contract.toObject(), replay: false };
  };
  try { return await runInTransaction(work); }
  catch (err) {
    if (err?.code === 11000) return runInTransaction(work);
    throw err;
  }
}

async function selectedForWarehouse(warehouse, session = null) {
  if (warehouse.commissionEngine !== 'collection_v2') return null;
  const contract = await Contract.findOne({ _id: warehouse.collectionContractId,
    warehouseId: warehouse._id, revision: warehouse.collectionContractRevision,
  }).session(session).lean();
  if (!contract || contract.policyVersion !== POLICY_VERSION) throw changed();
  return contract;
}

// Serializes contract selection with activation. An activation racing order
// creation either precedes it or rejects stale selection; never two models.
async function lockSelection(warehouseId, contract, session) {
  if (!session?.inTransaction()) throw new Error('Contract selection requires a transaction.');
  const filter = contract
    ? { _id: warehouseId, commissionEngine: 'collection_v2', collectionContractId: contract._id, collectionContractRevision: contract.revision }
    : { _id: warehouseId, commissionEngine: { $ne: 'collection_v2' } };
  const result = await Warehouse.updateOne(filter, { $inc: { collectionPolicyLock: 1 } }, { session, timestamps: false });
  if (result.matchedCount !== 1) throw changed();
}

function invoiceSnapshot(contract, { repId, areaType, invoiceSyp }) {
  if (!contract || !Number.isSafeInteger(invoiceSyp) || invoiceSyp < 0 || !['city', 'city_ring', 'rural'].includes(areaType)) throw invalid();
  const repRate = repId == null ? { rateBps: 0 } : contract.repRates.find(row => String(row.repId) === String(repId));
  if (!repRate) throw ApiError.conflict('The assigned representative is not in this contract version.', 'REP_CONTRACT_VERSION_REQUIRED');
  const numerator = BigInt(invoiceSyp) * BigInt(repRate.rateBps);
  const originalCommissionSyp = Number((numerator + 5000n) / 10000n);
  return { policyVersion: POLICY_VERSION, contractId: contract._id, contractRevision: contract.revision,
    contractRef: contract.agreementReference, originalRateBps: repRate.rateBps, areaType, invoiceSyp,
    originalCommissionSyp, deliveryFeeSyp: contract.deliveryFeeSyp };
}
function repriceSnapshot(snapshot, invoiceSyp) {
  return invoiceSnapshot({ _id: snapshot.contractId, revision: snapshot.contractRevision,
    agreementReference: snapshot.contractRef, deliveryFeeSyp: snapshot.deliveryFeeSyp,
    repRates: [{ repId: 'frozen', rateBps: snapshot.originalRateBps }],
  }, { repId: 'frozen', areaType: snapshot.areaType, invoiceSyp });
}

module.exports = { createAndActivate, selectedForWarehouse, lockSelection, invoiceSnapshot, repriceSnapshot };
