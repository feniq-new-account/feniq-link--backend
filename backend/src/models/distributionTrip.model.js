const { Schema, model } = require('mongoose');

const stopSchema = new Schema({
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  pharmacyName: { type: String, required: true, maxlength: 160 },
  address: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
  note: { type: String, default: '', maxlength: 500 },
  decidedAt: { type: Date, default: null },
}, { _id: true });

const tripSchema = new Schema({
  region: { type: String, required: true, trim: true, maxlength: 160 },
  serviceDate: { type: Date, required: true },
  driverName: { type: String, required: true, trim: true, maxlength: 160 },
  driverPhone: { type: String, trim: true, maxlength: 24, default: '' },
  // Pilot: assign an existing active rep login to operate this trip.
  // Transport-only drivers will need their own role/onboarding later.
  driverUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  status: {
    type: String,
    enum: ['planned', 'in_progress', 'completed', 'cancelled'],
    default: 'planned',
  },
  // An explicit road-route polyline, configured by operations before trip start.
  // No route => deviation is UNKNOWN, never guessed from straight stop lines.
  routeCorridorMeters: { type: Number, min: 100, max: 2000, default: 300 },
  routePoints: {
    type: [[Number]], default: [],
    validate: {
      validator: points => Array.isArray(points) &&
        points.length <= 500 &&
        points.every(p => Array.isArray(p) && p.length === 2 &&
          Number.isFinite(p[0]) && p[0] >= -90 && p[0] <= 90 &&
          Number.isFinite(p[1]) && p[1] >= -180 && p[1] <= 180),
      message: 'Invalid planned route polyline.',
    },
  },
  revision: { type: Number, default: 0 },
  stops: { type: [stopSchema], default: [] },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  cancellationReason: { type: String, default: '', maxlength: 500 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

tripSchema.index({ serviceDate: -1, _id: -1 });
tripSchema.index({ status: 1, serviceDate: -1 });
module.exports = model('DistributionTrip', tripSchema);
