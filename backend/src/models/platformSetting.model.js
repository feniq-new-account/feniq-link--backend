const { Schema, model } = require('mongoose');

// Settings the admin changes from the panel rather than from the host's
// environment - one document per key. Read through
// services/platformSettings.service.js, never directly.
const platformSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = model('PlatformSetting', platformSettingSchema);
