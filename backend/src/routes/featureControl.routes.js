const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { objectIdParams } = require('../middlewares/validateRequest');
const { asyncHandler } = require('../utils/asyncHandler');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
const { ApiError } = require('../utils/ApiError');
const service = require('../services/featureControl.service');
const Bundle = require('../models/featureBundle.model');
const Audit = require('../models/featureControlAudit.model');
const { OPTIONAL_FEATURES, CORE_FEATURES, SELF_CONFIGURABLE, FEATURE_DEFINITIONS } = require('../config/featureCatalog');
const { RUNTIME_FEATURE_DEFAULTS, readRuntimeFeatures } = require('../services/runtimeFeatures.service');
const publicRouter = Router();
publicRouter.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, features: await readRuntimeFeatures() });
}));
const admin = Router();
admin.use(authenticate, authorize('admin'), requireActiveStatus);
admin.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, platform: await service.readPlatform(),
    platformFeatureNames: [...OPTIONAL_FEATURES, ...Object.keys(RUNTIME_FEATURE_DEFAULTS)],
    platformFeatureDefaults: RUNTIME_FEATURE_DEFAULTS, featureNames: OPTIONAL_FEATURES, featureDefinitions: FEATURE_DEFINITIONS,
    coreFeatureNames: CORE_FEATURES, selfConfigurable: SELF_CONFIGURABLE });
}));
admin.put('/', asyncHandler(async (req, res) => {
  res.json({ success: true, platform: await service.savePlatform(req.user._id, req.body) });
}));
admin.get('/bundles', asyncHandler(async (req, res) => {
  // Administrative definitions, no warehouse data; bounded response.
  res.json({ success: true, bundles: await Bundle.find({}).sort({ createdAt: -1, _id: -1 }).limit(200).lean() });
}));
admin.post('/bundles', asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, bundle: await service.createBundle(req.user._id, req.body) });
}));
admin.get('/audit', asyncHandler(async (req, res) => {
  const id = req.query.warehouseId;
  if (id !== undefined && (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) {
    throw ApiError.badRequest('Invalid warehouse filter.', undefined, 'INVALID_FEATURE_CONTROL');
  }
  const filter = id ? { $or: [{ scope: 'platform' }, { scope: 'bundle' }, { warehouseId: id }] } : {};
  res.set('Cache-Control', 'no-store').json({ success: true,
    events: await Audit.find(filter).populate('actorId', 'name').populate('warehouseId', 'nameAr nameEn')
      .sort({ createdAt: -1, _id: -1 }).limit(100).lean() });
}));
const warehouseAdmin = Router({ mergeParams: true });
warehouseAdmin.use(authenticate, authorize('admin'), requireActiveStatus, objectIdParams('warehouseId'));
warehouseAdmin.use(asyncHandler(async (req, res, next) => {
  if (!await require('../models/warehouse.model').exists({ _id: req.params.warehouseId })) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
  next();
}));
warehouseAdmin.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, ...await service.getEntitlements(req.params.warehouseId) });
}));
warehouseAdmin.post('/grants', asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, ...await service.addGrant(req.params.warehouseId, req.user._id, req.body) });
}));
warehouseAdmin.post('/grants/:grantId/revoke', objectIdParams('grantId'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...await service.revokeGrant(req.params.warehouseId, req.params.grantId, req.user._id, req.body) });
}));
const self = Router();
self.use(authenticate, authorize('warehouse'), requireActiveStatus);
self.get('/', asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const result = await service.getEntitlements(warehouse._id);
  // Contract references, administrative grant history and actor IDs are not self configuration.
  res.set('Cache-Control', 'no-store').json({ success: true, ...result, configuration: {
    revision: result.revision, features: result.configuration?.configuration || {},
  }, decisions: Object.fromEntries(Object.entries(result.decisions).map(([key, d]) => [key, {
    allowed: d.allowed, reason: d.reason, effectiveUntil: d.effectiveUntil,
  }])), selfConfigurable: SELF_CONFIGURABLE });
}));
self.put('/configuration', asyncHandler(async (req, res) => {
  if (!require('../utils/rolePermissions').rolePermissions(req.user).featureConfigure) throw ApiError.forbidden('Only the warehouse owner can configure features.', 'OWNER_REQUIRED');
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const result = await service.configureWarehouse(warehouse._id, req.user._id, req.body);
  res.json({ success: true, revision: result.revision, features: result.features });
}));
module.exports = { admin, warehouseAdmin, self, publicRouter };
