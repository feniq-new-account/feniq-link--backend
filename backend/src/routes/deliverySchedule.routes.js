const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const { stringQueryOnly, objectIdParams } = require('../middlewares/validateRequest');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
const { requireWarehouseFeature } = require('../middlewares/warehouseFeature.middleware');
const { hasFeature } = require('../services/warehouseSubscription.service');
const Assignment = require('../models/deliveryAssignment.model');
const service = require('../services/deliverySchedule.service');
const router = Router();
router.use(authenticate, authorize('warehouse'), requireActiveStatus, stringQueryOnly);
router.get('/', asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  res.set('Cache-Control', 'no-store').json({ success: true, settings: await service.settings(warehouse._id),
    entitled: await hasFeature(warehouse._id, 'deliverySchedule') });
}));
router.put('/', requireWarehouseFeature('deliverySchedule'), asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  res.json({ success: true, settings: await service.configure(warehouse._id, req.user._id, req.body) });
}));
router.get('/pharmacies', requireWarehouseFeature('deliverySchedule'), asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const result = await require('../services/rep.service').searchPharmacies(warehouse._id, { q: req.query.q });
  const pharmacies = (result.pharmacies || result).map((row) => row.pharmacy || row);
  const assignments = await Assignment.find({ warehouseId: warehouse._id, pharmacyId: { $in: pharmacies.map((row) => row._id || row.id) } }).lean();
  res.set('Cache-Control', 'no-store').json({ success: true, pharmacies: pharmacies.map((row) => ({
    id: String(row._id || row.id), nameAr: row.nameAr, nameEn: row.nameEn, city: row.city, address: row.address,
    assignment: assignments.find((a) => String(a.pharmacyId) === String(row._id || row.id)) || { zoneId: null, revision: 0 },
  })) });
}));
router.put('/pharmacies/:pharmacyId', objectIdParams('pharmacyId'), requireWarehouseFeature('deliverySchedule'), asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  res.json({ success: true, assignment: await service.assign(warehouse._id, req.user._id, req.params.pharmacyId, req.body) });
}));
// Correcting an already promised date remains available after subscription expiry.
router.put('/orders/:orderId/reschedule', objectIdParams('orderId'), asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  res.json({ success: true, deliveryEstimate: await service.reschedule(warehouse._id, req.user._id, req.params.orderId, req.body) });
}));
module.exports = router;
