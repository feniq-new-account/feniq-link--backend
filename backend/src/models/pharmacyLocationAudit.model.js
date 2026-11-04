const { Schema, model } = require('mongoose');
const schema = new Schema({
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ pharmacyId: 1, createdAt: -1 });
module.exports = model('PharmacyLocationAudit', schema);
