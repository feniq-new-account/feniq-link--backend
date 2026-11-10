const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/adminCommission.controller');
const quarter = require('../controllers/adminQuarterAllocation.controller');

const router = Router();

// Admin-only throughout: this is the platform's view of what warehouses owe
// it. A warehouse gets its own Settlement tab (/warehouse/settlement) and can
// never see another's position, or record its own payment as received.
router.use(authenticate, authorize('admin'));

// Future benefit redistribution DRAFT: preview/config only, no ledger writes.
router.get('/allocation-draft', quarter.get);
router.put('/allocation-draft', quarter.put);
router.post('/allocation-draft/preview', quarter.preview);

router.get('/overview', controller.overview);
router.get('/warehouses/:warehouseId', controller.warehouseDetail);
router.post('/collections', controller.recordCollection);
router.post('/collections/:id/reverse', controller.reverseCollection);

module.exports = router;
