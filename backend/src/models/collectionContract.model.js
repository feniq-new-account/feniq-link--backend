const { Schema, model } = require('mongoose');
// Append-only version of the existing agreed rep rates. No default percentage
// or delivery fee is invented, and no historical invoice is reinterpreted.
const schema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  revision: { type: Number, required: true, min: 1 },
  policyVersion: { type: String, required: true },
  agreementReference: { type: String, required: true, maxlength: 500 },
  basis: { type: String, enum: ['net_pharmacy_invoice'], required: true },
  repRates: { type: [{
    _id: false, repId: { type: Schema.Types.ObjectId, ref: 'Rep', required: true },
    rateBps: { type: Number, required: true, min: 0, max: 1000 },
  }], default: [] },
  deliveryFeeSyp: { type: Number, default: null },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  approvedAt: { type: Date, required: true },
  idempotencyKey: { type: String, required: true },
  fingerprint: { type: String, required: true },
}, { timestamps: false });
schema.index({ warehouseId: 1, revision: 1 }, { unique: true });
schema.index({ warehouseId: 1, idempotencyKey: 1 }, { unique: true });
module.exports = model('CollectionContract', schema);
