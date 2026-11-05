const { Schema, model } = require('mongoose');

// Ephemeral only: one latest fix per trip, auto-expiring after one hour.
// No historical route log, warehouse visibility or public read endpoints.
const schema = new Schema({
  tripId: { type: Schema.Types.ObjectId, ref: 'DistributionTrip', required: true, unique: true },
  driverUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracyMeters: { type: Number, required: true, min: 0, max: 150 },
  measuredAt: { type: Date, required: true },
  receivedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = model('DistributionLiveLocation', schema);
