'use strict';
// Feniq's future commission-beneficiary model. It is a *draft calculator*,
// not a posted collection or pharmacy credit writer. All percentages below
// describe what share OF THAT BENEFICIARY'S BASE entitlement is transferred.
// This distinction matters: 50% of the city's rep half is one quarter of
// the ORIGINAL commission, not half of the entire commission.
const { ApiError } = require('./ApiError');

const VERSION = 'quarter-allocation-draft-v1';
const MAX_BPS = 10000;
const DEFAULT_PLAN = Object.freeze({
  city: Object.freeze({ feniqToPharmacyBps: 0, repToPharmacyBps: 0 }),
  outside: Object.freeze({ feniqToPharmacyBps: 0 }),
});
const invalid = () => ApiError.badRequest(
  'Invalid beneficiary allocation plan or financial preview.',
  undefined, 'INVALID_QUARTER_ALLOCATION'
);

function only(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) throw invalid();
}
function money(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}
function bps(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_BPS) throw invalid();
  return value;
}
function validatePlan(plan) {
  only(plan, ['city', 'outside']);
  if (!Object.hasOwn(plan, 'city') || !Object.hasOwn(plan, 'outside')) throw invalid();
  only(plan.city, ['feniqToPharmacyBps', 'repToPharmacyBps']);
  only(plan.outside, ['feniqToPharmacyBps']);
  if (!Object.hasOwn(plan.city, 'feniqToPharmacyBps') ||
      !Object.hasOwn(plan.city, 'repToPharmacyBps') ||
      !Object.hasOwn(plan.outside, 'feniqToPharmacyBps')) throw invalid();
  return {
    city: {
      feniqToPharmacyBps: bps(plan.city.feniqToPharmacyBps),
      repToPharmacyBps: bps(plan.city.repToPharmacyBps),
    },
    outside: { feniqToPharmacyBps: bps(plan.outside.feniqToPharmacyBps) },
  };
}
function scopeForArea(areaType) {
  if (areaType === 'city') return 'city';
  if (areaType === 'rural' || areaType === 'city_ring') return 'outside';
  throw invalid();
}
function halfUp(n, d) { return Number((2n * n + d) / (2n * d)); }
function allocateOriginal(originalCommissionSyp, areaType, plan = DEFAULT_PLAN) {
  money(originalCommissionSyp);
  const validated = validatePlan(plan);
  const scope = scopeForArea(areaType);
  const amount = BigInt(originalCommissionSyp);
  // Original 4 quarters. We retain the historical half-up convention:
  // the city's Feniq half receives the spare lira on odd values.
  const feniqBaseSyp = scope === 'city' ? Number((amount + 1n) / 2n) : originalCommissionSyp;
  const repBaseSyp = originalCommissionSyp - feniqBaseSyp;
  const city = validated.city;
  const feniqTransferBps = scope === 'city' ? city.feniqToPharmacyBps : validated.outside.feniqToPharmacyBps;
  const repTransferBps = scope === 'city' ? city.repToPharmacyBps : 0;
  const pharmacyFromFeniqSyp = halfUp(BigInt(feniqBaseSyp) * BigInt(feniqTransferBps), BigInt(MAX_BPS));
  const pharmacyFromRepSyp = halfUp(BigInt(repBaseSyp) * BigInt(repTransferBps), BigInt(MAX_BPS));
  const feniqSyp = feniqBaseSyp - pharmacyFromFeniqSyp;
  const repSyp = repBaseSyp - pharmacyFromRepSyp;
  const pharmacySyp = pharmacyFromFeniqSyp + pharmacyFromRepSyp;
  if (feniqSyp < 0 || repSyp < 0 ||
      BigInt(feniqSyp) + BigInt(repSyp) + BigInt(pharmacySyp) !== amount) throw invalid();
  return {
    scope, originalCommissionSyp, feniqSyp, repSyp, pharmacySyp,
    pharmacyFromFeniqSyp, pharmacyFromRepSyp,
    // For explanation only. These quarters are the bases, not rounded money.
    baseQuarters: scope === 'city' ? { feniq: 2, rep: 2 } : { feniq: 4, rep: 0 },
  };
}
function earnedOnVerifiedCollection({
  invoiceSyp, originalCommissionSyp, collectedSyp,
  returnedCommissionSyp = 0, areaType, plan = DEFAULT_PLAN,
}) {
  money(invoiceSyp); money(originalCommissionSyp);
  money(collectedSyp); money(returnedCommissionSyp);
  if (!invoiceSyp || collectedSyp > invoiceSyp ||
      returnedCommissionSyp > originalCommissionSyp ||
      originalCommissionSyp > invoiceSyp) throw invalid();
  const netCommission = originalCommissionSyp - returnedCommissionSyp;
  const earned = halfUp(BigInt(netCommission) * BigInt(collectedSyp), BigInt(invoiceSyp));
  return allocateOriginal(earned, areaType, plan);
}
function incrementOnVerifiedCollection({
  invoiceSyp, originalCommissionSyp, previousCollectedSyp, collectedSyp,
  returnedCommissionSyp = 0, areaType, plan = DEFAULT_PLAN,
}) {
  money(previousCollectedSyp);
  if (collectedSyp < previousCollectedSyp) throw invalid();
  const shared = { invoiceSyp, originalCommissionSyp, returnedCommissionSyp, areaType, plan };
  const before = earnedOnVerifiedCollection({ ...shared, collectedSyp: previousCollectedSyp });
  const after = earnedOnVerifiedCollection({ ...shared, collectedSyp });
  const keys = ['originalCommissionSyp', 'feniqSyp', 'repSyp', 'pharmacySyp',
    'pharmacyFromFeniqSyp', 'pharmacyFromRepSyp'];
  return {
    policyVersion: VERSION, cumulative: after,
    increment: Object.fromEntries(keys.map(key => [key, after[key] - before[key]])),
  };
}
function correctionForReturn({
  invoiceSyp, originalCommissionSyp, collectedSyp,
  previousReturnedCommissionSyp, returnedCommissionSyp,
  areaType, plan = DEFAULT_PLAN,
}) {
  money(previousReturnedCommissionSyp);
  money(returnedCommissionSyp);
  if (returnedCommissionSyp < previousReturnedCommissionSyp) throw invalid();
  const source = { invoiceSyp, originalCommissionSyp, collectedSyp, areaType, plan };
  const before = earnedOnVerifiedCollection({ ...source, returnedCommissionSyp: previousReturnedCommissionSyp });
  const after = earnedOnVerifiedCollection({ ...source, returnedCommissionSyp });
  const keys = ['originalCommissionSyp', 'feniqSyp', 'repSyp', 'pharmacySyp',
    'pharmacyFromFeniqSyp', 'pharmacyFromRepSyp'];
  return {
    policyVersion: VERSION, earned: after,
    correction: Object.fromEntries(keys.map(key => [key, after[key] - before[key]])),
  };
}
module.exports = {
  VERSION, MAX_BPS, DEFAULT_PLAN, validatePlan, scopeForArea,
  allocateOriginal, earnedOnVerifiedCollection,
  incrementOnVerifiedCollection, correctionForReturn,
};
