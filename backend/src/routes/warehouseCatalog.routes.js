const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehouseCatalog.controller');

const router = Router();

router.get('/search', authenticate, authorize('warehouse'), requireActiveStatus, controller.search);
// The warehouse's own catalog requests - status, and the admin's reason when rejected.
router.get('/requests', authenticate, authorize('warehouse'), requireActiveStatus, controller.myRequests);
router.get('/suggestions', authenticate, authorize('warehouse'), requireActiveStatus, controller.suggestions);

module.exports = router;
