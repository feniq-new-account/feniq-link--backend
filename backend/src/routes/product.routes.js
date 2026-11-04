const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { stringQueryOnly, objectIdParams } = require('../middlewares/validateRequest');
const controller = require('../controllers/product.controller');

// mergeParams: true - this router is mounted at /warehouses/:warehouseId/products
// (see warehouse.routes.js) and needs access to the parent's :warehouseId.
const router = Router({ mergeParams: true });

// Catalog overhaul Phase 11 (L1): a malformed warehouse id or query value is a 400.
router.get(
  '/',
  authenticate,
  authorize('pharmacy'),
  requireActiveStatus,
  stringQueryOnly,
  objectIdParams('warehouseId'),
  controller.list
);

router.get('/revision', authenticate, authorize('pharmacy'), requireActiveStatus,
  objectIdParams('warehouseId'), controller.revision);

// The other medicines in this warehouse with the same active ingredient,
// strength and form.
router.get(
  '/:productId/alternatives',
  authenticate,
  authorize('pharmacy'),
  requireActiveStatus,
  stringQueryOnly,
  objectIdParams('warehouseId', 'productId'),
  controller.alternatives
);

// The same medicine and its alternatives at the other warehouses.
router.get(
  '/:productId/alternatives/elsewhere',
  authenticate,
  authorize('pharmacy'),
  requireActiveStatus,
  stringQueryOnly,
  objectIdParams('warehouseId', 'productId'),
  controller.alternativesElsewhere
);

module.exports = router;
