const { Schema, model } = require('mongoose');
const slot = new Schema({ weekday: Number, departureTime: String, arrivalHours: Number, cutoffHours: Number }, { _id: false });
const exception = new Schema({ date: String, cancelled: Boolean, departureTime: String, arrivalHours: Number, cutoffHours: Number }, { _id: false });
const zone = new Schema({ name: String, active: Boolean, preparationHours: Number, slots: [slot], exceptions: [exception] });
const schema = new Schema({ warehouseId: { type: Schema.Types.ObjectId, required: true, unique: true },
  enabled: { type: Boolean, default: false }, revision: { type: Number, default: 0 }, lockVersion: { type: Number, default: 0 }, zones: [zone] }, { timestamps: true });
module.exports = model('DeliverySchedule', schema);
