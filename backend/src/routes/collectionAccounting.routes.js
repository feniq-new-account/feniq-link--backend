const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const contracts = require('../services/collectionContract.service');
const settlements = require('../services/collectionSettlement.service');
const reads = require('../services/collectionAccountingRead.service');
const grants = require('../services/collectionGrant.service');
const feniqReceipts = require('../services/feniqReceipt.service');
const remittances = require('../services/feniqRemittance.service');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');

const warehouse = Router();
warehouse.use(authenticate, authorize('warehouse'), requireActiveStatus);
warehouse.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
warehouse.get('/', asyncHandler(async (req, res) => {
  res.json({ success: true, ...await reads.journal(req.user._id, req.query) });
}));

const admin = Router();
admin.use(authenticate, authorize('admin'), requireActiveStatus);
admin.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
admin.get('/warehouses/:warehouseId', asyncHandler(async (req, res) => {
  res.json({ success: true, ...await reads.journal(req.user._id, req.query, req.params.warehouseId) });
}));
admin.post('/warehouses/:warehouseId/contracts', asyncHandler(async (req, res) => {
  const result = await contracts.createAndActivate(req.user._id, req.params.warehouseId, req.body);
  if (result.replay) res.set('Idempotent-Replay', 'true');
  const contract = result.contract;
  res.status(result.replay ? 200 : 201).json({ success: true, appliesTo: 'new_orders_only',
    contract: { id: contract._id, revision: contract.revision, warehouseId: contract.warehouseId,
      agreementReference: contract.agreementReference, basis: contract.basis, repRates: contract.repRates,
      deliveryFeeSyp: contract.deliveryFeeSyp, approvedAt: contract.approvedAt },
  });
}));
admin.post('/warehouses/:warehouseId/settlements', asyncHandler(async (req, res) => {
  const result = await settlements.confirmWarehouseSettlement(req.user._id, req.params.warehouseId, req.body);
  if (result.replay) res.set('Idempotent-Replay', 'true');
  const settlement = result.settlement;
  res.status(result.replay ? 200 : 201).json({ success: true, pharmacyDebtChanged: false, commissionJournalUpdated: true,
    settlement: { id: settlement._id, warehouseId: settlement.warehouseId, cadence: settlement.cadence,
      periodFrom: settlement.periodFrom, periodTo: settlement.periodTo, proofReviewIds: settlement.proofReviewIds,
      reference: settlement.reference, confirmedAt: settlement.confirmedAt },
  });
}));
// Explicit administrative provisioning only. An admin role does not grant cash
// recording, approval or remittance rights without a persisted scoped grant.
admin.get('/warehouses/:warehouseId/actor-grants', asyncHandler(async (req, res) => {
  res.json({ success: true, grants: await grants.list(req.user._id, req.params.warehouseId) });
}));
admin.post('/warehouses/:warehouseId/actor-grants', asyncHandler(async (req, res) => {
  const result = await grants.issue(req.user._id, req.params.warehouseId, req.body);
  if (result.replay) res.set('Idempotent-Replay', 'true');
  res.status(result.replay ? 200 : 201).json({ success: true, ...result });
}));
admin.post('/warehouses/:warehouseId/actor-grants/:grantId/revoke', asyncHandler(async (req, res) => {
  const result = await grants.revoke(req.user._id, req.params.warehouseId, req.params.grantId, req.body);
  if (result.replay) res.set('Idempotent-Replay', 'true');
  res.json({ success: true, ...result });
}));
// This writer is explicitly OFF unless staging enables
// FENIQ_COLLECTION_RECEIPTS_ENABLED=true. No real-money pilot by default.
admin.get('/warehouses/:warehouseId/feniq-receipts', asyncHandler(async (req, res) => {
  res.json({ success: true, ...await feniqReceipts.list(req.user._id, req.params.warehouseId, req.query) });
}));
admin.post('/warehouses/:warehouseId/feniq-receipts', asyncHandler(async (req, res) => {
  const result = await feniqReceipts.record(req.user._id, req.params.warehouseId, req.body);
  if (result.replay) res.set('Idempotent-Replay', 'true');
  res.status(result.replay ? 200 : 201).json({ success: true, ...result });
}));
admin.post('/warehouses/:warehouseId/feniq-receipts/:receiptId/review', asyncHandler(async (req, res) => {
  const result = await feniqReceipts.review(req.user._id, req.params.warehouseId, req.params.receiptId, req.body);
  if (result.replay) res.set('Idempotent-Replay', 'true');
  res.json({ success: true, ...result });
}));
admin.get('/warehouses/:warehouseId/feniq-custody', asyncHandler(async (req, res) => {
  res.json({ success: true, ...await feniqReceipts.listCustody(req.user._id, req.params.warehouseId, req.query) });
}));
function sendOperation(res, result) {
  if (result.replay) res.set('Idempotent-Replay', 'true');
  res.status(result.replay ? 200 : 201).json({ success: true, ...result });
}
admin.get('/warehouses/:warehouseId/cash-reconciliation', asyncHandler(async (req, res) => {
  res.json({ success: true, ...await remittances.read(req.user._id, req.params.warehouseId, req.query) });
}));
admin.get('/warehouses/:warehouseId/cash-reconciliation/:snapshotId', asyncHandler(async (req, res) => {
  res.json({ success: true, ...await remittances.readSnapshot(req.user._id, req.params.warehouseId, req.params.snapshotId) });
}));
admin.post('/warehouses/:warehouseId/cash-reconciliation', asyncHandler(async (req, res) => {
  sendOperation(res, await remittances.reconcile(req.user._id, req.params.warehouseId, req.body));
}));
admin.post('/warehouses/:warehouseId/remittances', asyncHandler(async (req, res) => {
  sendOperation(res, await remittances.record(req.user._id, req.params.warehouseId, req.body));
}));
admin.post('/warehouses/:warehouseId/remittances/:movementId/reversals', asyncHandler(async (req, res) => {
  sendOperation(res, await remittances.record(req.user._id, req.params.warehouseId, req.body, req.params.movementId));
}));
warehouse.get('/cash-reconciliation', asyncHandler(async (req, res) => {
  const own = await loadWarehouseOrThrow(req.user._id, { session: null });
  res.json({ success: true, ...await remittances.read(req.user._id, String(own._id), req.query) });
}));
warehouse.get('/cash-reconciliation/:snapshotId', asyncHandler(async (req, res) => {
  const own = await loadWarehouseOrThrow(req.user._id);
  res.json({ success: true, ...await remittances.readSnapshot(req.user._id, String(own._id), req.params.snapshotId) });
}));
warehouse.post('/remittances/:movementId/review', asyncHandler(async (req, res) => {
  const own = await loadWarehouseOrThrow(req.user._id);
  sendOperation(res, await remittances.review(req.user._id, String(own._id), req.params.movementId, req.body));
}));
module.exports = { warehouse, admin };
