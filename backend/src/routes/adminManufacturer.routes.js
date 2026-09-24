const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { stringQueryOnly, objectIdParam } = require('../middlewares/validateRequest');
const { singleImageUpload } = require('../middlewares/upload.middleware');
const controller = require('../controllers/adminManufacturer.controller');

const router = Router();

router.use(authenticate, authorize('admin'), stringQueryOnly);
// Catalog overhaul Phase 11 (L1): malformed ids and query values are 400s.
router.param('id', objectIdParam);

router.get('/', controller.list);
router.patch('/:id', controller.update);
router.post('/:id/merge', controller.merge);
router.post('/:id/logo', singleImageUpload, controller.uploadLogo);
router.delete('/:id/logo', controller.clearLogo);

module.exports = router;
