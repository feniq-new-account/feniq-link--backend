const { Schema, model } = require('mongoose');
const schema = new Schema({
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  period: { type: String, required: true }, // Asia/Damascus YYYY-MM of delivery
  tiers: { type: [new Schema({ minSyp: Number, discountSyp: Number }, { _id: false })], default: [] },
  eligibleSyp: { type: Number, default: 0, min: 0 },
  entitlementSyp: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
schema.index({ pharmacyId: 1, warehouseId: 1, period: 1 }, { unique: true });
module.exports = model('MonthlyLoyaltyPeriod', schema);
