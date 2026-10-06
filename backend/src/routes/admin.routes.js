const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/admin.controller');
const registration = require('../controllers/adminRegistration.controller');
const { syndicateListUpload } = require('../middlewares/upload.middleware');

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/pending-accounts', controller.listPendingAccounts);
// The Accounts management page - both roles, every status, filters + search.
router.get('/accounts', controller.listAccounts);
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
router.put('/registration/telegram/bot', registration.setBotToken);
router.delete('/registration/telegram/bot', registration.removeBot);
router.post('/registration/telegram/link', registration.createTelegramLink);
router.delete('/registration/telegram/link', registration.unlinkTelegram);

module.exports = router;
