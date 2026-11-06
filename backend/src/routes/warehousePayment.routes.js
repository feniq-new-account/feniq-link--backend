const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehousePayment.controller');
const { rolePermissions } = require('../utils/rolePermissions');
const { ApiError } = require('../utils/ApiError');

const router = Router();

// Basic recording and documented reversal remain available in freemium.
// The controller/service still require an accountant and enforce tenant scope.
router.use(authenticate, authorize('warehouse'), requireActiveStatus);

// Money-Flow V2: payments are append-only. The V1 PATCH (edit) and DELETE
// routes are gone - a mistake is corrected by posting a reversal, which keeps
// both the original and the correction in the history. See payment.service.js.
// The permission belongs to the action, never a case-sensitive URL check.
// Express accepts case variants of these routes by default.
function requireAccountingPermission(permission) {
  return (req, res, next) => {
    if (!rolePermissions(req.user)[permission]) {
      throw ApiError.forbidden('An accountant account is required to record payments.', 'ACCOUNTANT_REQUIRED');
    }
    next();
  };
}
router.post('/', requireAccountingPermission('paymentRecord'), controller.create);
router.post('/:id/reverse', requireAccountingPermission('paymentReverse'), controller.reverse);

module.exports = router;
