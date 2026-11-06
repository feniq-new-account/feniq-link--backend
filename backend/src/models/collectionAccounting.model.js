const { Schema, model } = require('mongoose');
const ref = (name, required = true) => ({ type: Schema.Types.ObjectId, ref: name, required, default: required ? undefined : null });
const money = { type: Number, required: true };
const epoch = new Schema({ accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'),
  openingSequence: money, openingBalanceSyp: money, at: { type: Date, required: true },
}, { timestamps: false });
epoch.index({ accountId: 1 }, { unique: true });
const invoice = new Schema({ accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'), pharmacyId: ref('Pharmacy'),
  orderId: ref('Order'), chargeEntryId: ref('LedgerEntry'), repId: ref('Rep', false),
  invoiceNumber: Number, deliveredAt: { type: Date, required: true }, terms: { type: Schema.Types.Mixed, required: true },
  fx: { type: Schema.Types.Mixed, default: null },
}, { timestamps: false });
invoice.index({ orderId: 1 }, { unique: true });
invoice.index({ chargeEntryId: 1 }, { unique: true });
invoice.index({ accountId: 1, deliveredAt: 1, _id: 1 });
// Rebuildable current position, separate from the immutable invoice and events.
// No HTTP mutation surface; every change is tied to its allocation-run source.
const position = new Schema({ invoiceId: ref('CollectionInvoice'), accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'),
  pharmacyId: ref('Pharmacy'), orderId: ref('Order'), allocationRunId: ref('CollectionAllocationRun'),
  ledgerSequence: money, invoiceSyp: money, outstandingSyp: money, cashRecordedSyp: money,
  creditAppliedSyp: money, otherNonCashSyp: money, eligibleCollectedSyp: money,
  originalCommissionSyp: money, feniqSyp: money, repSyp: money, netCommissionPotentialSyp: money,
  state: { type: String, enum: ['open', 'partial', 'paid', 'void'], required: true },
  asOf: { type: Date, required: true },
}, { timestamps: false });
position.index({ invoiceId: 1 }, { unique: true });
position.index({ warehouseId: 1, state: 1, _id: -1 });
position.index({ warehouseId: 1, pharmacyId: 1, _id: -1 });
const run = new Schema({ accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'),
  revision: money, ledgerSequence: money, sourceKey: { type: String, required: true },
  previousRunId: ref('CollectionAllocationRun', false), actorId: ref('User'),
  reason: { type: String, required: true }, at: { type: Date, required: true },
  chunked: { type: Boolean, default: false },
  allocationCount: { type: Number, required: true }, unappliedCount: { type: Number, required: true },
  outstandingCount: { type: Number, required: true },
  allocations: { type: [{ _id: false, paymentId: ref('Payment', false), chargeEntryId: ref('LedgerEntry', false),
    orderId: ref('Order', false), returnCreditUseId: ref('CollectionReturnCreditUse', false),
    engine: { type: String, required: true }, amountSyp: money }], default: [] },
  unapplied: { type: [{ _id: false, paymentId: ref('Payment', false), amountSyp: money }], default: [] },
  outstanding: { type: [{ _id: false, chargeEntryId: ref('LedgerEntry', false), orderId: ref('Order', false),
    engine: { type: String, required: true }, amountSyp: money }], default: [] },
}, { timestamps: false });
run.index({ accountId: 1, revision: 1 }, { unique: true });
run.index({ accountId: 1, sourceKey: 1 }, { unique: true });
for (const path of ['allocations', 'unapplied', 'outstanding']) run.path(path).validate(rows => rows.length <= 500, 'Allocation rows must be stored in bounded chunks.');
const allocationChunk = new Schema({ runId: ref('CollectionAllocationRun'), accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'),
  section: { type: String, enum: ['allocations', 'unapplied', 'outstanding'], required: true },
  part: { type: Number, required: true, min: 0 },
  rows: { type: [Schema.Types.Mixed], required: true, validate: rows => rows.length > 0 && rows.length <= 500 },
}, { timestamps: false });
allocationChunk.index({ runId: 1, section: 1, part: 1 }, { unique: true });
const recognition = new Schema({ paymentId: ref('Payment'), accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'),
  collector: { type: String, enum: ['warehouse', 'feniq'], required: true },
  proofReviewId: ref('PaymentProofReview', false), settlementId: ref('CollectionSettlement', false),
  actorId: ref('User'), at: { type: Date, required: true },
}, { timestamps: false });
recognition.index({ paymentId: 1 }, { unique: true });
recognition.index({ accountId: 1, paymentId: 1 });
const event = new Schema({ invoiceId: ref('CollectionInvoice'), accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'),
  repId: ref('Rep', false), allocationRunId: ref('CollectionAllocationRun'),
  sourceKey: { type: String, required: true }, actorId: ref('User'), reason: { type: String, required: true },
  at: { type: Date, required: true }, eligibleCollectedSyp: money, returnedCommissionSyp: money,
  originalCommissionSyp: money, feniqSyp: money, repSyp: money,
  targetOriginalCommissionSyp: money, targetFeniqSyp: money, targetRepSyp: money,
}, { timestamps: false });
event.index({ invoiceId: 1, sourceKey: 1 }, { unique: true });
event.index({ warehouseId: 1, at: 1, _id: 1 });
const adjustment = new Schema({ invoiceId: ref('CollectionInvoice'), warehouseId: ref('Warehouse'),
  accountId: ref('LedgerAccount'), returnId: ref('Return'), returnedCommissionSyp: money,
  goodsCreditSyp: money, actorId: ref('User'), at: { type: Date, required: true },
}, { timestamps: false });
adjustment.index({ returnId: 1 }, { unique: true });
adjustment.index({ accountId: 1, invoiceId: 1 });
const settlement = new Schema({ warehouseId: ref('Warehouse'), periodFrom: { type: Date, required: true },
  periodTo: { type: Date, required: true }, cadence: { type: String, enum: ['weekly'], required: true },
  proofReviewIds: { type: [Schema.Types.ObjectId], required: true },
  reference: { type: String, required: true }, confirmedBy: ref('User'), confirmedAt: { type: Date, required: true },
  idempotencyKey: { type: String, required: true }, fingerprint: { type: String, required: true },
}, { timestamps: false });
settlement.index({ warehouseId: 1, idempotencyKey: 1 }, { unique: true });
settlement.index({ proofReviewIds: 1 }, { unique: true });
const credit = new Schema({ accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'), pharmacyId: ref('Pharmacy'),
  invoiceId: ref('CollectionInvoice'), returnId: ref('Return'), amountSyp: money,
  returnedCommissionSyp: money, compensationClawbackSyp: { ...money, default: 0 },
  amountUsd: { type: Number, default: null }, fx: { type: Schema.Types.Mixed, default: null },
  issuedBy: ref('User'), issuedAt: { type: Date, required: true },
}, { timestamps: false });
credit.index({ returnId: 1 }, { unique: true });
credit.index({ accountId: 1, issuedAt: 1, _id: 1 });
credit.index({ warehouseId: 1, issuedAt: 1 });
const use = new Schema({ accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'),
  creditId: ref('CollectionReturnCredit'), orderId: ref('Order'), amountSyp: money,
  reservedBy: ref('User'), reservedAt: { type: Date, required: true },
}, { timestamps: false });
use.index({ accountId: 1, orderId: 1 });
use.index({ creditId: 1, _id: 1 });
use.index({ warehouseId: 1, creditId: 1 });
const release = new Schema({ accountId: ref('LedgerAccount'), warehouseId: ref('Warehouse'), useId: ref('CollectionReturnCreditUse'),
  amountSyp: money, actorId: ref('User'), at: { type: Date, required: true },
  sourceKey: { type: String, required: true }, reason: { type: String, required: true },
}, { timestamps: false });
release.index({ useId: 1, sourceKey: 1 }, { unique: true });
release.index({ accountId: 1, useId: 1 });
release.index({ warehouseId: 1, useId: 1 });

// Services expose append/read only; no financial record has an edit/delete API.
module.exports = {
  Epoch: model('CollectionAccountEpoch', epoch), Invoice: model('CollectionInvoice', invoice),
  Position: model('CollectionInvoicePosition', position),
  AllocationRun: model('CollectionAllocationRun', run), Recognition: model('CollectionRecognition', recognition),
  AllocationChunk: model('CollectionAllocationChunk', allocationChunk),
  Event: model('CollectionCommissionEvent', event), ReturnAdjustment: model('CollectionReturnAdjustment', adjustment),
  Settlement: model('CollectionSettlement', settlement),
  ReturnCredit: model('CollectionReturnCredit', credit), ReturnCreditUse: model('CollectionReturnCreditUse', use),
  ReturnCreditRelease: model('CollectionReturnCreditRelease', release),
};
