const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/adminDiscountCode.controller');

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.post('/:id/approve', controller.approve);
router.post('/:id/reject', controller.reject);
router.post('/:id/stop', controller.stop);

module.exports = router;
