const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { singleImageUpload } = require('../middlewares/upload.middleware');
const controller = require('../controllers/adminManufacturer.controller');

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/', controller.list);
router.patch('/:id', controller.update);
router.post('/:id/merge', controller.merge);
router.post('/:id/logo', singleImageUpload, controller.uploadLogo);
router.delete('/:id/logo', controller.clearLogo);

module.exports = router;
