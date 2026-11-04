const { Schema, model } = require('mongoose');
const schema = new Schema({
  scope: { type: String, enum: ['platform', 'warehouse', 'bundle'], required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  revision: { type: Number, required: true },
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ scope: 1, warehouseId: 1, createdAt: -1 });
module.exports = model('FeatureControlAudit', schema);
