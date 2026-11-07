'use strict';
const { Schema, model } = require('mongoose');

// A physical cash report is NOT yet a pharmacy payment. Only a second,
// independently authorized reviewer can approve it and atomically create
// the one canonical Payment and its LedgerEntry.
const schema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, immutable: true },
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, immutable: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  amountSyp: { type: Number, required: true, min: 1, immutable: true },
  amountUsd: { type: Number, default: null, immutable: true },
  fx: { type: Schema.Types.Mixed, default: null, immutable: true },
  actualReceivedAt: { type: Date, required: true, immutable: true },
  reference: { type: String, required: true, immutable: true, maxlength: 500 },
  note: { type: String, default: null, immutable: true, maxlength: 1000 },
  recordedAt: { type: Date, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  decisionKey: { type: String },
  decisionFingerprint: { type: String },
  rejectionReason: { type: String, default: null },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
}, { timestamps: false });
schema.index({ warehouseId: 1, idempotencyKey: 1 }, { unique: true });
// One review key identifies exactly one receipt decision, across all receipts.
schema.index({ warehouseId: 1, decisionKey: 1 }, {
  unique: true, partialFilterExpression: { decisionKey: { $type: 'string' } },
});
schema.index({ warehouseId: 1, decisionKey: 1 }, {
  unique: true, partialFilterExpression: { decisionKey: { $type: 'string' } },
});
schema.index({ paymentId: 1 }, {
  unique: true, partialFilterExpression: { paymentId: { $type: 'objectId' } },
});
schema.index({ warehouseId: 1, status: 1, recordedAt: -1 });
module.exports = model('FeniqCollectionReceipt', schema);
