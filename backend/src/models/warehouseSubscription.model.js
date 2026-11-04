const { Schema, model } = require('mongoose');

const { LEGACY_FEATURES: FEATURES } = require('../utils/subscriptionPolicy');
const featureFields = Object.fromEntries(FEATURES.map((name) => [name, { type: Boolean, default: true }]));
const schema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, unique: true },
  revision: { type: Number, default: 0 },
  plan: { type: String, enum: ['free', 'basic', 'management', 'field_team'], default: 'free' },
  status: { type: String, enum: ['free', 'trial', 'active', 'paused'], default: 'free' },
  startedAt: { type: Date, required: true },
  trialUntil: { type: Date, required: true },
  paidUntil: { type: Date, default: null },
  graceDays: { type: Number, default: 7, min: 0, max: 30 },
  features: { type: new Schema(featureFields, { _id: false }), default: () => ({}) },
  note: { type: String, default: '', maxlength: 1000 },
}, { timestamps: true });

module.exports = model('WarehouseSubscription', schema);
module.exports.FEATURES = FEATURES;
