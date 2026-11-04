const { Schema, model } = require('mongoose');
const schema = new Schema({ warehouseId: { type: Schema.Types.ObjectId, required: true },
  pharmacyId: { type: Schema.Types.ObjectId, required: true }, zoneId: { type: Schema.Types.ObjectId, default: null },
  revision: { type: Number, default: 0 } }, { timestamps: true });
schema.index({ warehouseId: 1, pharmacyId: 1 }, { unique: true });
module.exports = model('DeliveryAssignment', schema);
