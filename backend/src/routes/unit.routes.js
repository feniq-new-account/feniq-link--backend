const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const { UNITS } = require('../config/units');

const router = Router();

// The fixed unit list (config/units.js) - shared reference data like
// categories: the warehouse's and admin's product forms show it as a
// dropdown, and any client can label a unit code with it.
router.get(
  '/',
  authenticate,
  authorize('pharmacy', 'warehouse', 'admin'),
  requireActiveStatus,
  asyncHandler(async (req, res) => {
    res.json({ success: true, units: UNITS.map(({ code, nameAr, nameEn }) => ({ code, nameAr, nameEn })) });
  })
);

module.exports = router;
