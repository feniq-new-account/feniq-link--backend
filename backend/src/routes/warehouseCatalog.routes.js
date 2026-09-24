const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { stringQueryOnly } = require('../middlewares/validateRequest');
const controller = require('../controllers/warehouseCatalog.controller');

const router = Router();

router.get('/search', authenticate, authorize('warehouse'), requireActiveStatus, stringQueryOnly, controller.search);
// The warehouse's own catalog requests - status, and the admin's reason when rejected.
router.get('/requests', authenticate, authorize('warehouse'), requireActiveStatus, stringQueryOnly, controller.myRequests);
router.get('/suggestions', authenticate, authorize('warehouse'), requireActiveStatus, stringQueryOnly, controller.suggestions);

module.exports = router;
