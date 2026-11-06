const { Schema, model } = require('mongoose');

const schema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: 'DistributionTrip', required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  event: { type: String, enum: ['created', 'driver_assigned', 'started', 'stop_delivered', 'stop_failed', 'completed', 'cancelled'], required: true },
  revision: { type: Number, required: true },
  stopId: { type: Schema.Types.ObjectId, default: null },
  // Present only on explicitly keyed driver stop mutations (legacy records omit it).
  requestId: { type: String, maxlength: 96 },
  note: { type: String, default: '', maxlength: 500 },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ tripId: 1, createdAt: -1 });
// A retry of one offline delivery decision must never generate a second event.
// Partial index excludes old events and admin operations without requestId.
schema.index({ tripId: 1, actorId: 1, requestId: 1 }, {
  unique: true,
  partialFilterExpression: { requestId: { $type: 'string' } },
});
module.exports = model('DistributionTripEvent', schema);
