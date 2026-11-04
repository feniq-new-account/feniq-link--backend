const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const service = require('../services/launch.service');
const publicRouter = Router();
publicRouter.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, status: service.publicStatus(await service.readLaunch()) });
}));
const admin = Router();
admin.use(authenticate, authorize('admin'));
admin.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, configuration: await service.readLaunch() });
}));
admin.put('/', asyncHandler(async (req, res) => {
  res.json({ success: true, configuration: await service.saveLaunch(req.user._id, req.body) });
}));
module.exports = { publicRouter, admin };
