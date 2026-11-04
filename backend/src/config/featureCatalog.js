const { LEGACY_FEATURES, CORE_FEATURES } = require('../utils/subscriptionPolicy');
// Technical keys only; no commercial bundle assignment or prices.
const OPTIONAL_FEATURES = Object.freeze([...LEGACY_FEATURES, 'ownerMobileAccess']);
const SELF_CONFIGURABLE = LEGACY_FEATURES;
module.exports = { OPTIONAL_FEATURES, SELF_CONFIGURABLE, CORE_FEATURES };
