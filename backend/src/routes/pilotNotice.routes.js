const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const service = require('../services/pilotNotice.service');

const publicRouter = Router();
publicRouter.get('/', asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, notice: service.publicNotice(await service.readNotice()) });
}));

const admin = Router();
admin.use(authenticate, authorize('admin'), requireActiveStatus);
admin.get('/', asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, configuration: await service.readNotice() });
}));
admin.put('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, configuration: await service.saveNotice(req.user._id, req.body) });
}));

module.exports = { publicRouter, admin };
