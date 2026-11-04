const { requireWarehouseFeature } = require('../middlewares/warehouseFeature.middleware');
const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/rep.controller');

const router = Router();

router.use(authenticate, authorize('rep'), requireActiveStatus);

router.get('/me', controller.me);
router.get('/pharmacies', controller.pharmacies);
router.get('/pharmacies/:pharmacyId', controller.pharmacy);
router.get('/visits', controller.visits);
router.post('/visits', requireWarehouseFeature('repTracking'), controller.createVisit);

module.exports = router;
