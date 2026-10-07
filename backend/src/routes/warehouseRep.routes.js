const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehouseRep.controller');

const router = Router();

router.use(authenticate, authorize('warehouse'), requireActiveStatus);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/visits', controller.visits);
router.get('/pharmacy-search', controller.searchPharmacies);
router.put('/pharmacies/:pharmacyId/rep', controller.assignPharmacy);
router.get('/pharmacies/:pharmacyId/visit-code', controller.visitCode);
router.patch('/:repId', controller.update);
router.post('/:repId/reset-password', controller.resetPassword);
router.get('/:repId/pharmacies', controller.pharmacies);

module.exports = router;
