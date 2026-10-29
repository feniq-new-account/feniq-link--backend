const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { stringQueryOnly } = require('../middlewares/validateRequest');
const { asyncHandler } = require('../utils/asyncHandler');
const router = Router();
router.get('/', authenticate, authorize('admin'), requireActiveStatus, stringQueryOnly, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ success: true, ...await require('../services/platformAnalytics.service').report(req.query) });
}));
module.exports = router;
