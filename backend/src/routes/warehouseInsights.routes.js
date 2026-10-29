const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { stringQueryOnly } = require('../middlewares/validateRequest');
const { asyncHandler } = require('../utils/asyncHandler');
const { parseCursorQuery } = require('../utils/pagination');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
const { hasFeature } = require('../services/warehouseSubscription.service');
const service = require('../services/warehouseInsights.service');
const { ApiError } = require('../utils/ApiError');
const { businessDateOf, zoneOffsetMs } = require('../utils/businessTime');
const router = Router();
router.use(authenticate, authorize('warehouse'), requireActiveStatus, stringQueryOnly);
function metadata(snapshot) {
  return { asOf: snapshot.asOf, timezone: 'Asia/Damascus', settings: snapshot.settings,
    asOfBusiness: new Date(snapshot.asOf.getTime() + zoneOffsetMs(snapshot.asOf)).toISOString().slice(0, 16).replace('T', ' ') };
}
async function entitled(warehouseId, feature) {
  if (!(await hasFeature(warehouseId, feature))) throw ApiError.forbidden('This feature is not active for this warehouse.', 'FEATURE_UNAVAILABLE');
}
router.get('/report', asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  await entitled(warehouse._id, req.user.warehouseRole === 'owner' ? 'ownerInsights' : 'salesReports');
  const data = await service.report(warehouse._id, req.query);
  res.set('Cache-Control', 'no-store').json({ success: true, ...data, ...metadata(data),
    period: { ...data.period, fromDate: businessDateOf(data.period.from), toDate: businessDateOf(data.period.to) } });
}));
router.get('/follow-up', asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const kind = req.query.kind;
  if (!['overdue', 'inactive'].includes(kind)) throw ApiError.badRequest('Invalid follow-up type.', undefined, 'INVALID_QUERY');
  await entitled(warehouse._id, kind === 'overdue' ? 'overdueReceivables' : 'inactivePharmacies');
  const { limit, after } = parseCursorQuery(req.query, 20);
  const snapshot = await service.snapshotForPage(warehouse._id, { after, force: req.query.force === '1' });
  res.set('Cache-Control', 'no-store').json({ success: true, ...metadata(snapshot),
    ...service.followUpPage(snapshot, kind, { limit, after }) });
}));
router.get('/export', asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const kind = req.query.kind;
  if (!['overdue', 'inactive'].includes(kind)) throw ApiError.badRequest('Invalid export type.', undefined, 'INVALID_QUERY');
  await entitled(warehouse._id, kind === 'overdue' ? 'overdueReceivables' : 'inactivePharmacies');
  const snapshot = await service.snapshotFor(warehouse._id);
  res.set('Cache-Control', 'no-store').json({ success: true, ...metadata(snapshot), rows: snapshot[kind] });
}));
router.put('/settings', asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  // The configuration is shared by both follow-up tools; neither may be
  // changed by a caller who has no subscription to either one.
  if (!await hasFeature(warehouse._id, 'overdueReceivables') && !await hasFeature(warehouse._id, 'inactivePharmacies')) {
    throw ApiError.forbidden('Follow-up is not active.', 'FEATURE_UNAVAILABLE');
  }
  res.json({ success: true, settings: await service.saveConfiguration(warehouse._id, req.body) });
}));
router.get('/alerts', asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  await entitled(warehouse._id, 'ownerAlerts');
  const snapshot = await service.snapshotFor(warehouse._id, { force: req.query.force === '1' });
  const alerts = [];
  if (snapshot.operational.pendingOrders) alerts.push({ code: 'orders_pending', count: snapshot.operational.pendingOrders });
  if (snapshot.operational.pendingReturns) alerts.push({ code: 'returns_pending', count: snapshot.operational.pendingReturns });
  if (await hasFeature(warehouse._id, 'overdueReceivables') && snapshot.overdue.length) {
    alerts.push({ code: 'overdue', count: snapshot.overdue.length, amountSyp: snapshot.aging.overdueSyp });
  }
  if (await hasFeature(warehouse._id, 'inactivePharmacies') && snapshot.inactive.length) {
    alerts.push({ code: 'inactive', count: snapshot.inactive.length });
  }
  res.set('Cache-Control', 'no-store').json({ success: true, ...metadata(snapshot), alerts });
}));
module.exports = router;
