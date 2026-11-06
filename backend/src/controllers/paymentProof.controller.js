const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const service = require('../services/paymentProof.service');

function serializeReview(row) {
  if (!row) return null;
  return { id: row._id, proofId: row.proofId, paymentId: row.paymentId,
    decision: row.decision, reason: row.reason, reviewedBy: row.reviewedBy, at: row.at };
}
function serializeProof(row) {
  return { id: row._id, paymentId: row.paymentId, revision: row.revision, collector: row.collector,
    proofReference: row.proofReference, note: row.note, amountSyp: row.amountSyp, amountUsd: row.amountUsd,
    paidAt: row.paidAt, fx: row.fx, submittedBy: row.submittedBy, at: row.at };
}
function respond(res, result, field, serialize) {
  if (result.replay) res.set('Idempotent-Replay', 'true');
  // A decision is a historical fact. Its current effectiveness must be read
  // through the snapshot endpoint (a payment may since have been reversed).
  res.set('Cache-Control', 'no-store').status(result.replay ? 200 : 201)
    .json({ success: true, financialPosting: false, [field]: serialize(result.record) });
}
const submit = asyncHandler(async (req, res) => {
  respond(res, await service.submit(req.user._id, req.params.id, req.body), 'proof', serializeProof);
});
const review = asyncHandler(async (req, res) => {
  respond(res, await service.review(req.user._id, req.params.id, req.params.proofId, req.body), 'review', serializeReview);
});
const list = asyncHandler(async (req, res) => {
  if (Object.keys(req.query).some(key => key !== 'before') ||
    (req.query.before !== undefined && (typeof req.query.before !== 'string' || !/^[1-9]\d*$/.test(req.query.before)))) {
    throw ApiError.badRequest('Invalid proof cursor.', undefined, 'INVALID_PAYMENT_PROOF');
  }
  const result = await service.list(req.user._id, req.params.id,
    { before: req.query.before === undefined ? null : Number(req.query.before) });
  res.set('Cache-Control', 'no-store').json({ success: true, ...result,
    rows: result.rows.map(row => ({ ...serializeProof(row), review: serializeReview(row.review), effectiveApproval: row.effectiveApproval })),
  });
});
module.exports = { submit, review, list };
