const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/admin.controller');
const registration = require('../controllers/adminRegistration.controller');
const { syndicateListUpload } = require('../middlewares/upload.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const pilotAccess = require('../services/pilotOrderAccess.service');

const router = Router();

router.use(authenticate, authorize('admin'));

// Admin-only pilot tester allowlist; never writes orders or accounting.
router.get('/pilot-access', asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, configuration: await pilotAccess.readPilotAccess() });
}));
router.put('/pilot-access', asyncHandler(async (req, res) => {
  res.json({ success: true, configuration: await pilotAccess.savePilotAccess(req.user._id, req.body) });
}));
router.get('/pending-accounts', controller.listPendingAccounts);
// The Accounts management page - both roles, every status, filters + search.
router.get('/accounts', controller.listAccounts);
// Inventory-only pilot maintenance preview: admin-authenticated, no writes.
router.get('/maintenance/preview', require('../utils/asyncHandler').asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, preview: await require('../services/adminMaintenancePreview.service').previewPilotCleanup() });
}));
router.post('/accounts/:userId/approve', controller.approveAccount);
router.post('/accounts/:userId/reject', controller.rejectAccount);
// Admin-only administrative actions (router-level authorize('admin') above).
router.post('/accounts/:userId/block', controller.blockAccount);
router.post('/accounts/:userId/unblock', controller.unblockAccount);
// Admin-only by the router-level authorize('admin') above - this mints a
// warehouse login, so it must never be reachable by any other role.
router.post('/warehouses', controller.createWarehouse);
router.post('/notifications', controller.broadcastNotification);

// Registration approval: the syndicate list, the approval switch, the Telegram bot.
router.get('/registration', registration.getStatus);
router.post('/registration/syndicate-list', syndicateListUpload, registration.importList);
router.post('/registration/check', registration.checkName);
router.put('/registration/approval', registration.setApproval);
router.put('/registration/min-score', registration.setMinScore);
router.put('/registration/telegram/bot', registration.setBotToken);
router.delete('/registration/telegram/bot', registration.removeBot);
router.post('/registration/telegram/link', registration.createTelegramLink);
router.delete('/registration/telegram/link', registration.unlinkTelegram);

module.exports = router;
