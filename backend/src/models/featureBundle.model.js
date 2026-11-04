const { Schema, model } = require('mongoose');
const { OPTIONAL_FEATURES } = require('../config/featureCatalog');
// Immutable definitions: issue a new code for a changed contractual package.
const schema = new Schema({
  code: { type: String, required: true, unique: true, maxlength: 80 },
  name: { type: String, required: true, maxlength: 120 },
  tier: { type: String, enum: ['custom', 'advanced'], default: 'custom' },
  features: [{ type: String, enum: OPTIONAL_FEATURES, required: true }],
  decisionRef: { type: String, required: true, maxlength: 500 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = model('FeatureBundle', schema);
