const { Schema, model } = require('mongoose');

const FEATURES = Object.freeze([
  'repTracking', 'loyalty', 'accounting', 'salesReports', 'ownerInsights',
  'overdueReceivables', 'inactivePharmacies', 'ownerAlerts', 'deliverySchedule',
]);
const featureFields = Object.fromEntries(FEATURES.map((name) => [name, { type: Boolean, default: true }]));
const schema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, unique: true },
  plan: { type: String, enum: ['basic', 'management', 'field_team'], default: 'field_team' },
  status: { type: String, enum: ['trial', 'active', 'paused'], default: 'trial' },
  startedAt: { type: Date, required: true },
  trialUntil: { type: Date, required: true },
  paidUntil: { type: Date, default: null },
  graceDays: { type: Number, default: 7, min: 0, max: 30 },
  features: { type: new Schema(featureFields, { _id: false }), default: () => ({}) },
  note: { type: String, default: '', maxlength: 1000 },
}, { timestamps: true });

module.exports = model('WarehouseSubscription', schema);
module.exports.FEATURES = FEATURES;
