const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { objectIdParams } = require('../middlewares/validateRequest');
const { asyncHandler } = require('../utils/asyncHandler');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
const access = require('../services/warehouseAccess.service');
const billing = require('../services/warehouseSubscription.service');
const Warehouse = require('../models/warehouse.model');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

const admin = Router();
admin.use(authenticate, authorize('admin'));
admin.get('/', asyncHandler(async (req, res) => {
  const { limit, after } = parseCursorQuery(req.query, 20);
  const cursor = parseObjectIdCursor(after);
  const filter = cursor ? { _id: { $gt: cursor } } : {};
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const search = req.query.search.trim().slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ nameAr: new RegExp(search, 'i') }, { nameEn: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
  }
  const rows = await Warehouse.find(filter).select('nameAr nameEn city phone isActive').sort({ _id: 1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  res.json({ success: true, warehouses: selected.map((row) => ({ ...row, id: row._id })),
    pagination: paginationMeta(hasMore, selected.length ? String(selected.at(-1)._id) : null) });
}));
admin.get('/:warehouseId/members', objectIdParams('warehouseId'), asyncHandler(async (req, res) => {
  const members = await access.listWarehouseMembers(req.params.warehouseId);
  const accessEvents = await require('../models/warehouseAudit.model').find({ warehouseId: req.params.warehouseId,
    action: { $in: ['member.created', 'member.role_changed'] } }).populate('actorId', 'name')
    .select('action actorId reason before after createdAt').sort({ createdAt: -1, _id: -1 }).limit(30).lean();
  res.set('Cache-Control', 'no-store').json({ success: true, members, accessEvents });
}));
admin.post('/:warehouseId/members', objectIdParams('warehouseId'), asyncHandler(async (req, res) => {
  const member = await access.createWarehouseMember(req.params.warehouseId, req.user._id, req.body || {});
  res.status(201).json({ success: true, member });
}));
admin.put('/:warehouseId/members/:userId', objectIdParams('warehouseId', 'userId'), asyncHandler(async (req, res) => {
  const members = await access.setWarehouseMemberRole(req.params.warehouseId, req.params.userId, req.user._id, req.body?.warehouseRole,
    { revision: req.body?.revision, reason: req.body?.reason });
  res.json({ success: true, members });
}));
admin.get('/:warehouseId/subscription', objectIdParams('warehouseId'), asyncHandler(async (req, res) => {
  // Validate membership target before exposing an apparent not-started trial.
  await access.listWarehouseMembers(req.params.warehouseId);
  res.json({ success: true, ...await billing.getSubscription(req.params.warehouseId) });
}));
admin.put('/:warehouseId/subscription', objectIdParams('warehouseId'), asyncHandler(async (req, res) => {
  if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 0) {
    throw require('../utils/ApiError').ApiError.conflict('Reload subscription before saving.', 'FEATURE_CONTROL_CHANGED');
  }
  res.json({ success: true, ...await billing.configureSubscription(req.params.warehouseId, req.user._id, req.body) });
}));

const self = Router();
self.use(authenticate, authorize('warehouse'), requireActiveStatus);
self.get('/', asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const result = await billing.getSubscription(warehouse._id);
  delete result.controlConfiguration;
  result.decisions = Object.fromEntries(Object.entries(result.decisions).map(([key, d]) => [key, {
    allowed: d.allowed, reason: d.reason, effectiveUntil: d.effectiveUntil,
  }]));
  res.set('Cache-Control', 'no-store').json({ success: true, ...result });
}));
module.exports = { admin, self };
