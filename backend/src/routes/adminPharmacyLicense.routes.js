const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/pharmacyLicense.controller');

const router = Router();
router.use(authenticate, authorize('admin'));
router.get('/', controller.listPending);
router.get('/:pharmacyId/document', controller.downloadAdmin);
router.post('/:pharmacyId/review', controller.review);

module.exports = router;
