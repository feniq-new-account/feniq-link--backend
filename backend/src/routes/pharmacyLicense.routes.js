const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { pharmacyLicenseUpload } = require('../middlewares/upload.middleware');
const controller = require('../controllers/pharmacyLicense.controller');

const router = Router();
router.use(authenticate, authorize('pharmacy'), requireActiveStatus);
router.get('/', controller.getOwnStatus);
router.post('/', pharmacyLicenseUpload, controller.submitOwn);
router.get('/document', controller.downloadOwn);

module.exports = router;
