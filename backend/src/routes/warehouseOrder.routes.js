const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehouseOrder.controller');
const balanceController = require('../controllers/warehouseBalance.controller');

const router = Router();

router.use(authenticate, authorize('warehouse'), requireActiveStatus);

router.get('/', controller.list);
// Read-only: where today's orders stand (counts by step, delivered today).
// Before '/:id' so 'pipeline' is never read as an order id.
router.get('/pipeline', require('../utils/asyncHandler').asyncHandler(async (req, res) => {
  const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, pipeline: await require('../services/orderPipeline.service').orderPipeline(warehouse._id) });
}));
// Money-Flow V2: the immutable invoice, with the commission and net figures
// the pharmacy's copy omits.
router.get('/:orderId/invoice', balanceController.invoice);
router.get('/:id', controller.getDetail);
router.post('/:id/advance-status', controller.advance);
router.patch('/:id/items', controller.updateItems);
// Per-order proof-of-delivery toggle - just this one flag on the order.
router.patch('/:id/delivery-seal', controller.setDeliverySealRequirement);

module.exports = router;
