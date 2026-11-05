const { Schema, model } = require('mongoose');

const schema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: 'DistributionTrip', required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  event: { type: String, enum: ['created', 'started', 'stop_delivered', 'stop_failed', 'completed', 'cancelled'], required: true },
  revision: { type: Number, required: true },
  stopId: { type: Schema.Types.ObjectId, default: null },
  note: { type: String, default: '', maxlength: 500 },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ tripId: 1, createdAt: -1 });
module.exports = model('DistributionTripEvent', schema);
