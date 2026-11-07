const PlatformSetting = require('../models/platformSetting.model');
const { ApiError } = require('../utils/ApiError');

// Preserve the current main behavior until an administrator explicitly pauses it.
// Read on every operation: no process-local cache or deployment is needed.
const RUNTIME_FEATURE_DEFAULTS = Object.freeze({ mutualRatings: true });
async function readRuntimeFeatures() {
  const row = await PlatformSetting.findOne({ key: 'featureControl' }).select('value.features').lean();
  return { mutualRatings: typeof row?.value?.features?.mutualRatings === 'boolean'
    ? row.value.features.mutualRatings : RUNTIME_FEATURE_DEFAULTS.mutualRatings };
}
async function requireMutualRatings() {
  if (!(await readRuntimeFeatures()).mutualRatings) {
    throw ApiError.forbidden('Mutual ratings are currently disabled.', 'RATINGS_DISABLED');
  }
}
module.exports = { RUNTIME_FEATURE_DEFAULTS, readRuntimeFeatures, requireMutualRatings };
