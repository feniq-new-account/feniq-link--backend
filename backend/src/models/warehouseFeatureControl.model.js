const { Schema, model } = require('mongoose');
const { OPTIONAL_FEATURES, SELF_CONFIGURABLE } = require('../config/featureCatalog');
const grant = new Schema({
  kind: { type: String, enum: ['bundle', 'addon', 'grant'], required: true },
  sourceCode: { type: String, maxlength: 80, default: '' },
  features: [{ type: String, enum: OPTIONAL_FEATURES, required: true }],
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  decisionRef: { type: String, required: true, maxlength: 500 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
const fields = Object.fromEntries(SELF_CONFIGURABLE.map(key => [key, Boolean]));
const schema = new Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, unique: true },
  revision: { type: Number, required: true, default: 0 },
  configuration: { type: new Schema(fields, { _id: false }), default: () => ({}) },
  grants: { type: [grant], default: [] },
}, { timestamps: true });
module.exports = model('WarehouseFeatureControl', schema);
