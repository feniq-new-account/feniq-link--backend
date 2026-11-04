const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const { previewCollection, validateManualAllocations } = require('../utils/collectionCommissionPolicy');
const { ApiError } = require('../utils/ApiError');
const router = Router();
router.use(authenticate, authorize('admin'), requireActiveStatus);
// Calculation only: no ledger, allocation record, payment, contract or order write.
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body || Object.keys(body).some(key => !['collection', 'allocation'].includes(key))) {
    throw ApiError.badRequest('Invalid commission preview.', undefined, 'INVALID_COMMISSION_PREVIEW');
  }
  const result = previewCollection(body.collection);
  if (body.allocation !== undefined) result.allocation = validateManualAllocations(body.allocation);
  res.set('Cache-Control', 'no-store').json({ success: true, ...result });
}));
module.exports = router;
