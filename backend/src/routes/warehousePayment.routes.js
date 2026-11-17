const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const controller = require('../controllers/warehousePayment.controller');
const proofs = require('../controllers/paymentProof.controller');
const { rolePermissions } = require('../utils/rolePermissions');
const { ApiError } = require('../utils/ApiError');

const router = Router();

// Basic recording and documented reversal remain available in freemium.
// Recording is open to every warehouse login (manager and accountant);
// reversing needs paymentReverse (accounting operators). Tenant scope is
// enforced by the controller/service.
router.use(authenticate, authorize('warehouse'), requireActiveStatus);

// Money-Flow V2: payments are append-only. The V1 PATCH (edit) and DELETE
// routes are gone - a mistake is corrected by posting a reversal, which keeps
// both the original and the correction in the history. See payment.service.js.
// The permission belongs to the action, never a case-sensitive URL check.
// Express accepts case variants of these routes by default.
function requireAccountingPermission(permission) {
  return (req, res, next) => {
    if (!rolePermissions(req.user)[permission]) {
      const message = permission === 'paymentReverse'
        ? 'An accountant account is required to reverse payments.'
        : 'An accountant account is required to record payments.';
      throw ApiError.forbidden(message, 'ACCOUNTANT_REQUIRED');
    }
    next();
  };
}
// Read-only: one business day's receipts (total, by method, by who recorded).
router.get('/receipts', require('../utils/asyncHandler').asyncHandler(async (req, res) => {
  const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, receipts: await require('../services/dailyReceipts.service').dailyReceipts(warehouse._id, { date: req.query.date }) });
}));
router.post('/', requireAccountingPermission('paymentRecord'), controller.create);
router.post('/:id/reverse', requireAccountingPermission('paymentReverse'), controller.reverse);
router.get('/:id/proofs', proofs.list);
router.post('/:id/proofs', requireAccountingPermission('paymentRecord'), proofs.submit);
router.post('/:id/proofs/:proofId/review', requireAccountingPermission('paymentProofReview'), proofs.review);

module.exports = router;
