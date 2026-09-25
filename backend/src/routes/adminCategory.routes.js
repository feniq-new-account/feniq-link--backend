const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { stringQueryOnly, objectIdParam } = require('../middlewares/validateRequest');
const controller = require('../controllers/adminCategory.controller');

// The admin's Categories screen (the shared read-only list stays GET /categories).
const router = Router();

router.use(authenticate, authorize('admin'), stringQueryOnly);
router.param('id', objectIdParam);

router.get('/', controller.list);
router.patch('/:id', controller.update);
router.post('/:id/merge', controller.merge);

module.exports = router;
