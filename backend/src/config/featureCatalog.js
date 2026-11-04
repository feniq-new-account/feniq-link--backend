const { LEGACY_FEATURES, CORE_FEATURES } = require('../utils/subscriptionPolicy');
// Technical keys only; no commercial bundle assignment or prices.
const OPTIONAL_FEATURES = Object.freeze([...LEGACY_FEATURES, 'ownerMobileAccess']);
const SELF_CONFIGURABLE = LEGACY_FEATURES;
const FEATURE_DEFINITIONS = Object.freeze(Object.fromEntries(OPTIONAL_FEATURES.map(key => [key, {
  status: key === 'accounting' ? 'scope_pending' : key === 'ownerMobileAccess' ? 'rights_only'
    : ['repTracking', 'ownerAlerts'].includes(key) ? 'limited' : 'available',
  ...(key === 'ownerInsights' ? { sharesReportWith: 'salesReports' } : {}),
}])));
module.exports = { OPTIONAL_FEATURES, SELF_CONFIGURABLE, CORE_FEATURES, FEATURE_DEFINITIONS };
