const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { discountCodeLimiter } = require('../middlewares/rateLimiter');
const orderController = require('../controllers/order.controller');

// The pharmacist's side of discount codes: only the cart preview. Applying a
// code for real happens on POST /orders (discountCode + discountCodeRevision).
const router = Router();

router.post(
  '/preview',
  authenticate,
  authorize('pharmacy'),
  requireActiveStatus,
  discountCodeLimiter,
  orderController.previewDiscountCode
);

module.exports = router;
