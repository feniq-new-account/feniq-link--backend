const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehouseCatalog.controller');

const router = Router();

router.get('/search', authenticate, authorize('warehouse'), requireActiveStatus, controller.search);
router.get('/suggestions', authenticate, authorize('warehouse'), requireActiveStatus, controller.suggestions);

module.exports = router;
