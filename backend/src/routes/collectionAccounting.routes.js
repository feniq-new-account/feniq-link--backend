const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const contracts = require('../services/collectionContract.service');
const settlements = require('../services/collectionSettlement.service');
const reads = require('../services/collectionAccountingRead.service');

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
module.exports = { warehouse, admin };
