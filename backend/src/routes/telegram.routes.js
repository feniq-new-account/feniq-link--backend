const { Router } = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const telegram = require('../services/telegram.service');

const router = Router();

// Telegram's deliveries for the admins' bot. Unauthenticated by design - the
// caller is Telegram - and guarded instead by the secret header Telegram was
// given at setWebhook (telegram.service.js handleWebhook).
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const accepted = await telegram.handleWebhook(req.get('X-Telegram-Bot-Api-Secret-Token'), req.body);
    res.status(accepted ? 200 : 401).json({ ok: accepted });
  })
);

module.exports = router;
