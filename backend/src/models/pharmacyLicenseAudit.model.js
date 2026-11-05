const { Schema, model } = require('mongoose');

const licenseAuditSchema = new Schema({
  pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['submitted', 'approved', 'rejected'], required: true },
  revision: { type: Number, required: true },
  note: { type: String, default: '', maxlength: 500 },
}, { timestamps: { createdAt: true, updatedAt: false } });

licenseAuditSchema.index({ pharmacyId: 1, createdAt: -1 });
module.exports = model('PharmacyLicenseAudit', licenseAuditSchema);
