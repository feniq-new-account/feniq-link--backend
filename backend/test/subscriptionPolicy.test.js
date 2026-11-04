const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateSubscription: evaluate, CORE_FEATURES } = require('../src/utils/subscriptionPolicy');

test('approved Damascus promotion and grace dates have exact exclusive boundaries', () => {
  for (const [at, expected] of [
    ['2026-12-31T23:59:59.999+03:00', 'promotion'],
    ['2027-01-01T00:00:00+03:00', 'grace'],
    ['2027-01-07T23:59:59.999+03:00', 'grace'],
    ['2027-01-08T00:00:00+03:00', 'freemium'],
  ]) assert.equal(evaluate(null, new Date(at)).state, expected, at);
});
test('an expired rolling trial cannot end the approved promotion or extend it after grace', () => {
  const row = { status: 'trial', trialUntil: '2026-12-01', features: { loyalty: false } };
  assert.equal(evaluate(row, new Date('2026-12-20')).features.repTracking, true);
  assert.equal(evaluate(row, new Date('2026-12-20')).features.loyalty, false);
  row.trialUntil = '2027-06-01';
  assert.equal(evaluate(row, new Date('2027-01-08')).features.repTracking, false);
});
test('existing paid rights and contractual grace survive the calendar transition', () => {
  const row = { status: 'active', paidUntil: '2027-03-01T00:00:00Z', graceDays: 2 };
  assert.equal(evaluate(row, new Date('2027-02-28')).state, 'active');
  assert.equal(evaluate(row, new Date('2027-03-01')).state, 'grace');
  assert.equal(evaluate(row, new Date('2027-03-03')).state, 'freemium');
});
test('expiry, commercial pause and missing subscription preserve every core capability', () => {
  for (const row of [null, { status: 'paused' }, { status: 'trial' }]) {
    const result = evaluate(row, new Date('2028-01-01'));
    for (const key of CORE_FEATURES) assert.equal(result.core[key], true);
    assert.equal(result.features.accounting, false);
  }
});
test('post-2026 signup gets no invented new campaign, while explicit paid rights still apply', () => {
  const now = new Date('2027-01-03T12:00:00Z');
  assert.equal(evaluate(null, now, { campaignEligible: false }).state, 'freemium');
  assert.equal(evaluate(null, now, { campaignEligible: false }).features.repTracking, false);
  assert.equal(evaluate(null, now, { campaignEligible: false }).core.basicOrders, true);
  assert.equal(evaluate({ status: 'active', paidUntil: '2027-03-01' }, now, { campaignEligible: false }).state, 'active');
});
test('legacy timestamps missing during promotion do not lock accounts, and new January accounts are not auto-promoted', () => {
  const { campaignEligibility } = require('../src/utils/featureEntitlements');
  assert.equal(campaignEligibility({}, null, new Date('2026-12-20')), true);
  assert.equal(campaignEligibility({}, null, new Date('2027-01-03')), false);
  assert.equal(campaignEligibility({ createdAt: '2026-12-31T20:59:59Z' }, null, new Date('2027-01-03')), true);
  assert.equal(campaignEligibility({ createdAt: '2026-12-31T21:00:00Z' }, null, new Date('2027-01-03')), false);
});
