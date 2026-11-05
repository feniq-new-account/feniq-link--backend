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
  status: {
    type: String,
    enum: ['planned', 'in_progress', 'completed', 'cancelled'],
    default: 'planned',
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
