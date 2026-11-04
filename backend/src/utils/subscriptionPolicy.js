// Approved SUB-01: Damascus civil dates, not a duration from account signup.
const PROMOTION_END = new Date('2027-01-01T00:00:00+03:00');
const GRACE_END = new Date('2027-01-08T00:00:00+03:00');
const LEGACY_FEATURES = Object.freeze([
  'repTracking', 'loyalty', 'accounting', 'salesReports', 'ownerInsights',
  'overdueReceivables', 'inactivePharmacies', 'ownerAlerts', 'deliverySchedule',
]);
const CORE_FEATURES = Object.freeze([
  'catalog', 'basicOrders', 'financialRecords', 'paymentRecording', 'returns', 'settlements',
]);

function evaluateSubscription(row, now = new Date(), { campaignEligible = true } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid policy time');
  const paidUntil = row?.paidUntil ? new Date(row.paidUntil) : null;
  const paidGrace = paidUntil && Number.isFinite(paidUntil.getTime())
    ? new Date(paidUntil.getTime() + (row.graceDays ?? 7) * 86400000) : null;
  const paid = row?.status === 'active' && paidUntil && now < paidUntil;
  const paidInGrace = row?.status === 'active' && paidGrace && now < paidGrace;
  const promotion = campaignEligible && now < PROMOTION_END;
  const campaignGrace = campaignEligible && !promotion && now < GRACE_END;
  const paused = row?.status === 'paused';
  const state = paused ? 'paused' : paid ? 'active' : promotion ? 'promotion'
    : campaignGrace || paidInGrace ? 'grace' : 'freemium';
  const usable = !paused && (paid || paidInGrace || promotion || campaignGrace);
  return {
    state, policyVersion: 'calendar-2026-11-04',
    expiresAt: paid || paidInGrace ? paidUntil : promotion || campaignGrace ? PROMOTION_END : null,
    graceUntil: paid || paidInGrace ? paidGrace : promotion || campaignGrace ? GRACE_END : null,
    features: Object.fromEntries(LEGACY_FEATURES.map(key => [key, Boolean(usable && row?.features?.[key] !== false)])),
    core: Object.fromEntries(CORE_FEATURES.map(key => [key, true])),
  };
}
module.exports = { PROMOTION_END, GRACE_END, LEGACY_FEATURES, CORE_FEATURES, evaluateSubscription };
