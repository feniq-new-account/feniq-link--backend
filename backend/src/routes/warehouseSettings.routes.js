const { requireWarehouseFeature } = require('../middlewares/warehouseFeature.middleware');
const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehouseSettings.controller');

const router = Router();

router.use(authenticate, authorize('warehouse'), requireActiveStatus);

router.get('/', controller.get);
router.patch('/', controller.update);
router.put('/loyalty', requireWarehouseFeature('loyalty'), controller.updateLoyalty);

module.exports = router;
