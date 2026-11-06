const { Router } = require('express');
const { authenticate, authorize, requireActiveStatus } = require('../middlewares/auth.middleware');
const { asyncHandler } = require('../utils/asyncHandler');
const { previewCollection, validateManualAllocations } = require('../utils/collectionCommissionPolicy');
const { ApiError } = require('../utils/ApiError');
const accountingPolicy = require('../utils/collectionAccountingPolicy');
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

// Confirmed 2026-11-06 rules. This remains a calculation endpoint: a request
// cannot approve proof, record cash, allocate a real receipt or change a ledger.
router.post('/accounting', asyncHandler(async (req, res) => {
  const body = req.body;
  const calculators = {
    fifo: accountingPolicy.allocateOldestInvoices,
    collection: accountingPolicy.collectionIncrement,
    return: accountingPolicy.returnCommissionCorrection,
    remittance: accountingPolicy.remittanceSchedule,
  };
  if (!body || Array.isArray(body) || !Object.keys(body).length ||
      Object.keys(body).some(key => !Object.hasOwn(calculators, key))) {
    throw ApiError.badRequest('Invalid collection accounting preview.', undefined, 'INVALID_COLLECTION_ACCOUNTING');
  }
  const result = {};
  for (const key of Object.keys(body)) result[key] = calculators[key](body[key]);
  res.set('Cache-Control', 'no-store').json({ success: true, previewOnly: true, persisted: false,
    policyVersion: accountingPolicy.POLICY_VERSION, ...result });
}));
module.exports = router;
