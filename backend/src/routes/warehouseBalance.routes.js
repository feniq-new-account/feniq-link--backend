const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehouseBalance.controller');
const { stringQueryOnly } = require('../middlewares/validateRequest');
const { asyncHandler } = require('../utils/asyncHandler');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
const { dashboard } = require('../services/accountantDashboard.service');

const router = Router();

router.use(authenticate, authorize('warehouse'), requireActiveStatus);

router.get('/dashboard', stringQueryOnly, asyncHandler(async (req, res) => {
    const warehouse = await loadWarehouseOrThrow(req.user._id);
    const data = await dashboard(warehouse._id, req.query);
    res.set('Cache-Control', 'no-store').json({ success: true, ...data });
  }));

// Money-Flow V2: the per-pharmacy detail is a chronological account statement
// over the ledger. The path is unchanged so the panel's existing route
// resolves; the payload is the statement plus the payment rows.
router.get('/', stringQueryOnly, controller.list);
// Before '/:pharmacyId', or "summary" would be read as a pharmacy id.
router.get('/summary', controller.summary);
router.get('/:pharmacyId', stringQueryOnly, controller.getOne);

module.exports = router;
