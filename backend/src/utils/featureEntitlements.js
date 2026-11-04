const { OPTIONAL_FEATURES, CORE_FEATURES } = require('../config/featureCatalog');
const { evaluateSubscription, PROMOTION_END, GRACE_END } = require('./subscriptionPolicy');

function campaignEligibility(warehouse, subscription, now = new Date()) {
  // An account observed during the approved campaign is eligible even when
  // a legacy record lacks its historical creation timestamp.
  if (now < PROMOTION_END) return true;
  const joined = warehouse?.createdAt || subscription?.startedAt;
  return Boolean(joined && new Date(joined) < PROMOTION_END);
}
function evaluateEntitlements({ subscription = null, control = null, platform = null, now = new Date(), campaignEligible = true } = {}) {
  const base = evaluateSubscription(subscription, now, { campaignEligible });
  const grants = (control?.grants || []).filter(g => !g.revokedAt && new Date(g.startsAt) <= now && now < new Date(g.endsAt));
  const decisions = {};
  for (const key of OPTIONAL_FEATURES) {
    const sources = grants.filter(g => g.features.includes(key)).map(g => ({
      kind: g.kind, id: String(g._id), sourceCode: g.sourceCode || '', endsAt: g.endsAt,
    }));
    const legacyAllowed = base.features[key] === true;
    // The new channel capability has no invented bundle membership.
    const promoChannel = campaignEligible && key === 'ownerMobileAccess' && ['promotion', 'grace'].includes(base.state) &&
      now < GRACE_END;
    const entitled = legacyAllowed || promoChannel || sources.length > 0;
    const globalDisabled = platform?.features?.[key] === false;
    const selfDisabled = control?.configuration?.[key] === false;
    const legacyDisabled = subscription?.features?.[key] === false;
    const allowed = Boolean(entitled && !globalDisabled && !selfDisabled && !legacyDisabled);
    const reason = globalDisabled ? 'platform_disabled' : selfDisabled ? 'warehouse_disabled'
      : legacyDisabled ? 'administratively_disabled' : !entitled ? 'no_entitlement'
        : sources.length ? 'grant' : base.state;
    const until = legacyAllowed || promoChannel ? [base.graceUntil || base.expiresAt] : [];
    const dates = [...until, ...sources.map(s => s.endsAt)].filter(Boolean).map(v => new Date(v).getTime());
    decisions[key] = { allowed, reason, sources, effectiveUntil: dates.length ? new Date(Math.max(...dates)) : null };
  }
  return {
    ...base,
    features: Object.fromEntries(OPTIONAL_FEATURES.map(key => [key, decisions[key].allowed])),
    core: Object.fromEntries(CORE_FEATURES.map(key => [key, true])), decisions,
    revision: control?.revision || 0, platformRevision: platform?.revision || 0,
  };
}
module.exports = { evaluateEntitlements, campaignEligibility };
