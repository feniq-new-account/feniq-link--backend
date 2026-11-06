const { Schema, model } = require('mongoose');
// Immutable evidence for ONE existing payment. Never a second payment or
// authorization to accrue collection-v2 commission on a historical invoice.
const schema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount', required: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  ledgerEntryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry', required: true },
  revision: { type: Number, required: true, min: 1 },
  collector: { type: String, enum: ['warehouse'], required: true },
  proofReference: { type: String, required: true, maxlength: 500 },
  note: { type: String, default: null, maxlength: 1000 },
  // Values copied from the posted payment, never from the evidence request.
  amountSyp: { type: Number, required: true },
  amountUsd: { type: Number, default: null },
  paidAt: { type: Date, required: true },
  fx: { type: Schema.Types.Mixed, default: null },
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true },
  idempotencyKey: { type: String, required: true },
  fingerprint: { type: String, required: true },
}, { timestamps: false });
schema.index({ warehouseId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ paymentId: 1, revision: 1 }, { unique: true });
schema.index({ warehouseId: 1, at: -1 });
module.exports = model('PaymentProof', schema);
