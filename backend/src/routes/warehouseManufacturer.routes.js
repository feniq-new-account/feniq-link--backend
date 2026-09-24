const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { stringQueryOnly } = require('../middlewares/validateRequest');
const controller = require('../controllers/warehouseManufacturer.controller');

const router = Router();

router.get('/', authenticate, authorize('warehouse'), requireActiveStatus, stringQueryOnly, controller.list);

module.exports = router;
