const test = require('node:test');
const assert = require('node:assert/strict');
const q = require('../src/utils/quarterCommissionAllocation');

const DEFAULT = q.DEFAULT_PLAN;
const move = ({
  cityFeniq = 0, cityRep = 0, outsideFeniq = 0,
} = {}) => ({
  city: { feniqToPharmacyBps: cityFeniq, repToPharmacyBps: cityRep },
  outside: { feniqToPharmacyBps: outsideFeniq },
});
const invoice = (areaType, plan, extra = {}) => ({
  invoiceSyp: 100000,
  originalCommissionSyp: 10000,
  collectedSyp: 100000,
  areaType,
  plan, ...extra,
});
const assertBalance = result => assert.equal(
  BigInt(result.feniqSyp) + BigInt(result.repSyp) + BigInt(result.pharmacySyp),
  BigInt(result.originalCommissionSyp)
);

test('defaults are exactly 2/2 city and 4/0 outside; no pharmacy allocation', () => {
  assert.equal(q.VERSION, 'quarter-allocation-draft-v1');
  const city = q.allocateOriginal(10000, 'city');
  assert.deepEqual(city.baseQuarters, { feniq: 2, rep: 2 });
  assert.equal(city.feniqSyp, 5000);
  assert.equal(city.repSyp, 5000);
  assert.equal(city.pharmacySyp, 0);
  for (const area of ['rural', 'city_ring']) {
    const outside = q.allocateOriginal(10000, area);
    assert.deepEqual(outside.baseQuarters, { feniq: 4, rep: 0 });
    assert.equal(outside.feniqSyp, 10000);
    assert.equal(outside.repSyp, 0);
    assert.equal(outside.pharmacySyp, 0);
    assertBalance(outside);
  }
});

test('one quarter from city rep transfers 50% OF rep half (not 50% of original)', () => {
  const result = q.allocateOriginal(10000, 'city', move({ cityRep: 5000 }));
  assert.deepEqual([
    result.feniqSyp, result.repSyp, result.pharmacySyp,
    result.pharmacyFromFeniqSyp, result.pharmacyFromRepSyp,
  ], [5000, 2500, 2500, 0, 2500]);
  assertBalance(result);
});

test('city admin can move from Feniq and rep independently', () => {
  const result = q.allocateOriginal(10000, 'city', move({ cityFeniq: 5000, cityRep: 5000 }));
  assert.deepEqual([result.feniqSyp, result.repSyp, result.pharmacySyp], [2500, 2500, 5000]);
  assert.equal(result.pharmacyFromFeniqSyp, 2500);
  assert.equal(result.pharmacyFromRepSyp, 2500);
  assertBalance(result);
});

test('outside admin may transfer any percentage of the four Feniq quarters', () => {
  const plan = move({ outsideFeniq: 2500 });
  const result = q.allocateOriginal(10000, 'rural', plan);
  assert.deepEqual([result.feniqSyp, result.repSyp, result.pharmacySyp], [7500, 0, 2500]);
  const ring = q.allocateOriginal(10000, 'city_ring', plan);
  assert.deepEqual([ring.feniqSyp, ring.repSyp, ring.pharmacySyp], [7500, 0, 2500]);
  assertBalance(result);
});

test('100% donor transfers cannot take another party money, never exceed original', () => {
  for (const areaType of ['city', 'rural']) {
    const result = q.allocateOriginal(10000, areaType,
      move({ cityFeniq: 10000, cityRep: 10000, outsideFeniq: 10000 }));
    assert.equal(result.pharmacySyp, 10000);
    assert.equal(result.feniqSyp + result.repSyp, 0);
    assertBalance(result);
  }
});

test('many tiny partial receipts reconcile cumulatively for odd SYP commissions', () => {
  for (const areaType of ['city', 'rural', 'city_ring']) {
    const plan = move({ cityRep: 5000, cityFeniq: 3333, outsideFeniq: 1234 });
    const cumulative = { originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0, pharmacySyp: 0 };
    for (let collectedSyp = 1; collectedSyp <= 101; collectedSyp++) {
      const { increment } = q.incrementOnVerifiedCollection({
        invoiceSyp: 101, originalCommissionSyp: 37,
        previousCollectedSyp: collectedSyp - 1, collectedSyp, areaType, plan,
      });
      for (const field of Object.keys(cumulative)) cumulative[field] += increment[field];
    }
    const full = q.allocateOriginal(37, areaType, plan);
    for (const field of Object.keys(cumulative)) assert.equal(cumulative[field], full[field]);
    assertBalance(full);
  }
});

test('the pharmacy reward earns zero without verified collection and corrects returns', () => {
  const plan = move({ cityRep: 5000, outsideFeniq: 2500 });
  assert.equal(q.earnedOnVerifiedCollection(invoice('city', plan, { collectedSyp: 0 })).pharmacySyp, 0);
  const full = q.earnedOnVerifiedCollection(invoice('city', plan));
  assert.equal(full.pharmacySyp, 2500);
  const correction = q.correctionForReturn({
    invoiceSyp: 100000, originalCommissionSyp: 10000, collectedSyp: 100000,
    previousReturnedCommissionSyp: 0, returnedCommissionSyp: 2000, areaType: 'city', plan,
  });
  assert.equal(correction.earned.pharmacySyp, 2000);
  assert.equal(correction.correction.pharmacySyp, -500);
  assert.equal(correction.correction.repSyp, -500);
  assert.equal(correction.correction.feniqSyp, -1000);
  const after = q.earnedOnVerifiedCollection(invoice('city', plan, { returnedCommissionSyp: 2000 }));
  assert.deepEqual(correction.earned, after);
  const firstHalf = q.earnedOnVerifiedCollection(invoice('rural', plan, { collectedSyp: 50000 }));
  assert.equal(firstHalf.pharmacySyp, 1250);
  const reduced = q.earnedOnVerifiedCollection(invoice('rural', plan, {
    collectedSyp: 50000, returnedCommissionSyp: 2000,
  }));
  assert.equal(reduced.pharmacySyp, 1000);
});

test('full reversal erases entire earned commission and its pharmacy attribution', () => {
  const plan = move({ cityFeniq: 4500, cityRep: 7500, outsideFeniq: 10000 });
  for (const areaType of ['city', 'rural']) {
    const corrected = q.correctionForReturn({
      invoiceSyp: 100000, originalCommissionSyp: 10000, collectedSyp: 100000,
      previousReturnedCommissionSyp: 0, returnedCommissionSyp: 10000,
      areaType, plan,
    });
    assert.equal(corrected.earned.originalCommissionSyp, 0);
    assert.equal(corrected.earned.pharmacySyp, 0);
    assert.equal(corrected.correction.originalCommissionSyp, -10000);
  }
});

test('invalid percentages, donor policies, missing scope and impossible payments fail closed', () => {
  for (const plan of [
    null, {}, { city: {} }, { city: DEFAULT.city, outside: { feniqToPharmacyBps: -1 } },
    move({ cityRep: 10001 }), move({ cityFeniq: 0.5 }), move({ outsideFeniq: NaN }),
    { ...move(), hidden: true },
    { city: { ...move().city, overwriteRealMoney: true }, outside: move().outside },
  ]) assert.throws(() => q.validatePlan(plan), { code: 'INVALID_QUARTER_ALLOCATION' });
  for (const amount of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => q.allocateOriginal(amount, 'city'));
  }
  assert.throws(() => q.allocateOriginal(100, 'unclassified'));
  assert.throws(() => q.earnedOnVerifiedCollection({
    invoiceSyp: 100, originalCommissionSyp: 200, collectedSyp: 50, areaType: 'city',
  }));
  assert.throws(() => q.incrementOnVerifiedCollection({
    invoiceSyp: 100, originalCommissionSyp: 10, previousCollectedSyp: 90,
    collectedSyp: 80, areaType: 'city',
  }));
});

test('large safe-integer amounts use BigInt for consistent exact conservation', () => {
  const n = Number.MAX_SAFE_INTEGER;
  const plan = move({ cityFeniq: 3333, cityRep: 7755, outsideFeniq: 6655 });
  for (const areaType of ['city', 'city_ring']) {
    const full = q.allocateOriginal(n, areaType, plan);
    assertBalance(full);
    assert.equal(full.originalCommissionSyp, n);
  }
});
