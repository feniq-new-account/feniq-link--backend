const { Schema, model } = require('mongoose');
const ref = name => ({ type: Schema.Types.ObjectId, ref: name, required: true, immutable: true });
const snapshot = new Schema({
  warehouseId: ref('Warehouse'), actorId: ref('User'), at: { type: Date, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  sourceHash: { type: String, required: true, immutable: true },
  result: { type: Schema.Types.Mixed, required: true, immutable: true },
}, { timestamps: false });
snapshot.index({ warehouseId: 1, idempotencyKey: 1 }, { unique: true });
snapshot.index({ warehouseId: 1, _id: -1 });
const remittance = new Schema({
  warehouseId: ref('Warehouse'), recordedBy: ref('User'),
  kind: { type: String, enum: ['transfer', 'reversal'], required: true, immutable: true },
  originalId: { type: Schema.Types.ObjectId, ref: 'FeniqRemittance', immutable: true, default: null },
  custodyIds: { type: [Schema.Types.ObjectId], required: true, immutable: true },
  reconciliationId: { type: Schema.Types.ObjectId, ref: 'FeniqCustodyReconciliation', immutable: true, default: null },
  sourceHash: { type: String, immutable: true, default: null },
  amountSyp: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  transferredAt: { type: Date, required: true, immutable: true },
  reference: { type: String, required: true, immutable: true, maxlength: 500 },
  reason: { type: String, immutable: true, default: null },
  recordedAt: { type: Date, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  status: { type: String, enum: ['pending', 'confirmed', 'rejected', 'reversed'], required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  decision: { type: String, enum: ['confirmed', 'rejected', null], default: null },
  decisionKey: String, decisionFingerprint: String, decisionReason: String,
}, { timestamps: false });
remittance.index({ warehouseId: 1, idempotencyKey: 1 }, { unique: true });
remittance.index({ warehouseId: 1, decisionKey: 1 },
  { unique: true, partialFilterExpression: { decisionKey: { $type: 'string' } } });
// A warehouse has one reserved cash movement at a time, independent of client keys.
remittance.index({ warehouseId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
remittance.index({ warehouseId: 1, _id: -1 });
// Recognition of commission already physically held by Feniq, NOT a second
// payment by a pharmacy or a fabricated warehouse cash transfer.
const withholding = new Schema({
  warehouseId: ref('Warehouse'), accountId: ref('LedgerAccount'), invoiceId: ref('CollectionInvoice'),
  allocationRunId: ref('CollectionAllocationRun'), reconciliationId: ref('FeniqCustodyReconciliation'),
  amountSyp: { type: Number, required: true, immutable: true, validate: Number.isSafeInteger },
  targetSyp: { type: Number, required: true, immutable: true, validate: Number.isSafeInteger },
  at: { type: Date, required: true, immutable: true },
}, { timestamps: false });
withholding.index({ invoiceId: 1, allocationRunId: 1 }, { unique: true });
withholding.index({ warehouseId: 1, at: 1 });
module.exports = { Reconciliation: model('FeniqCustodyReconciliation', snapshot), Remittance: model('FeniqRemittance', remittance),
  Withholding: model('FeniqCommissionWithholding', withholding) };
