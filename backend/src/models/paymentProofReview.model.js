const { Schema, model } = require('mongoose');
// One immutable decision per submission. Rejected proof can be replaced by a
// NEW submission/revision; neither evidence nor an old decision is rewritten.
const schema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  proofId: { type: Schema.Types.ObjectId, ref: 'PaymentProof', required: true },
  decision: { type: String, enum: ['approved', 'rejected'], required: true },
  reason: { type: String, default: null, maxlength: 1000 },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true },
  idempotencyKey: { type: String, required: true },
  fingerprint: { type: String, required: true },
}, { timestamps: false });
schema.index({ proofId: 1 }, { unique: true });
schema.index({ warehouseId: 1, idempotencyKey: 1 }, { unique: true });
module.exports = model('PaymentProofReview', schema);
