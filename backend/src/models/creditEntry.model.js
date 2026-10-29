const { Schema, model } = require('mongoose');

// One movement of a pharmacy's credit at a warehouse (pharmacyCredit.model.js):
//   earned   - its quarter of a delivered order's rep commission
//   used     - taken off a new order
//   released - handed back: the order that used it was cancelled, or an edit
//              made it smaller than the credit it had taken
const creditEntrySchema = new Schema(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    kind: { type: String, enum: ['earned', 'used', 'released', 'loyalty_earned', 'loyalty_reversed'], required: true },
    amountSyp: { type: Number, required: true, min: 0 },
    commissionSyp: { type: Number, min: 0, default: undefined },
    loyaltySyp: { type: Number, min: 0, default: undefined },
    returnId: { type: Schema.Types.ObjectId, ref: 'Return', default: undefined },
    loyaltyPeriod: { type: String, default: undefined },
  },
  { timestamps: true }
);

creditEntrySchema.index({ pharmacyId: 1, warehouseId: 1, createdAt: -1 });
// One "earned" per order, ever - the guard against crediting a delivery twice.
creditEntrySchema.index({ orderId: 1, kind: 1 }, { unique: true, partialFilterExpression: { kind: 'earned' } });

module.exports = model('CreditEntry', creditEntrySchema);
