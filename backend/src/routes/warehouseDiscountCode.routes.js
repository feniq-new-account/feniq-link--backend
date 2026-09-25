const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehouseDiscountCode.controller');

const router = Router();

router.use(authenticate, authorize('warehouse'), requireActiveStatus);

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.post('/:id/stop', controller.stop);

module.exports = router;
