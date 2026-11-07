'use strict';
const { Schema, model } = require('mongoose');

// Gross physical cash held by Feniq after a confirmed receipt. The net
// warehouse remittance is intentionally NOT guessed: contract/commission
// reconciliation must establish it before a transfer is recorded.
const schema = new Schema({
  receiptId: { type: Schema.Types.ObjectId, ref: 'FeniqCollectionReceipt', required: true, immutable: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, immutable: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, immutable: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount', required: true, immutable: true },
  grossHeldSyp: { type: Number, required: true, min: 1, immutable: true },
  actualReceivedAt: { type: Date, required: true, immutable: true },
  targetRemittanceAt: { type: Date, required: true, immutable: true },
  deadlineAt: { type: Date, required: true, immutable: true },
  reconciliationId: { type: Schema.Types.ObjectId, ref: 'FeniqCustodyReconciliation', default: null },
  reconciliationReasons: { type: [String], default: [] },
  netWarehouseDueSyp: { type: Number, default: null },
  status: { type: String, enum: ['awaiting_reconciliation', 'remittance_pending', 'remitted', 'reversed'],
    default: 'awaiting_reconciliation' },
}, { timestamps: false });
schema.index({ receiptId: 1 }, { unique: true });
schema.index({ paymentId: 1 }, { unique: true });
schema.index({ warehouseId: 1, status: 1, deadlineAt: 1 });
module.exports = model('FeniqCashCustody', schema);
