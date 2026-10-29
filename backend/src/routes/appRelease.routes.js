const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const service = require('../services/appRelease.service');

const publicRouter = Router();
publicRouter.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, serverTime: new Date().toISOString(), release: service.publicRelease(await service.readRelease()) });
}));

const admin = Router();
admin.use(authenticate, authorize('admin'));
admin.get('/', asyncHandler(async (req, res) => {
  const configuration = await service.readRelease({ fresh: true });
  res.json({ success: true, configuration, defaultOrigin: service.DEFAULT_ORIGIN });
}));
admin.post('/inspect', asyncHandler(async (req, res) => {
  res.json({ success: true, artifact: await service.inspectPublishedRelease(req.body?.sourceOrigin) });
}));
admin.put('/', asyncHandler(async (req, res) => {
  res.json({ success: true, configuration: await service.saveRelease(req.user._id, req.body) });
}));
module.exports = { publicRouter, admin };
