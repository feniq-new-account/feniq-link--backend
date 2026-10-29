const { Schema, model } = require('mongoose');

const rolePolicy = new Schema({
  recommendedBuild: { type: Number, required: true },
  minimumBuild: { type: Number, default: 1 },
  mandatoryAfter: { type: Date, default: null },
}, { _id: false });
const schema = new Schema({
  _id: { type: String, default: 'android' },
  enabled: { type: Boolean, default: true },
  latestBuild: { type: Number, required: true },
  versionName: { type: String, required: true },
  apkUrl: { type: String, required: true },
  sha256: { type: String, required: true },
  size: { type: Number, required: true },
  certificateSha256: { type: String, required: true },
  applicationId: { type: String, default: 'com.feniq.link' },
  roles: { pharmacy: rolePolicy, rep: rolePolicy, warehouse: rolePolicy },
  notes: { type: String, default: '' },
  revision: { type: Number, default: 1 },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  history: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true });
module.exports = model('AppRelease', schema);
