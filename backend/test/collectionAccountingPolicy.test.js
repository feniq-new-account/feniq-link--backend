const test = require('node:test');
const assert = require('node:assert/strict');
const {
  POLICY_VERSION, allocateOldestInvoices, collectionIncrement,
  returnCommissionCorrection, remittanceSchedule,
} = require('../src/utils/collectionAccountingPolicy');

// Synthetic examples, never commercial contract defaults.
const terms = { invoiceSyp: 100000, originalCommissionSyp: 10000, areaType: 'city', contractRef: 'synthetic-only' };
const row = (invoiceId, deliveredAt, outstandingSyp, extra = {}) => ({
  invoiceId, deliveredAt, outstandingSyp, accountId: 'account-a', engine: POLICY_VERSION, ...extra,
});
const allocate = (paymentSyp, invoices) => allocateOldestInvoices({ accountId: 'account-a', paymentSyp, invoices });
const correct = extra => returnCommissionCorrection({ terms, collectedSyp: 100000,
  previousReturnedCommissionSyp: 0, returnedCommissionSyp: 2000, ...extra });

test('FIFO pays older legacy debt before new-engine invoices and keeps extra cash explicit', () => {
  const invoices = [row('new', '2026-11-06T12:00:00Z', 70000),
    row('old', '2026-11-05T12:00:00Z', 30000, { engine: 'legacy' })];
  assert.deepEqual(allocate(50000, invoices).allocations, [
    { invoiceId: 'old', amountSyp: 30000, engine: 'legacy' },
    { invoiceId: 'new', amountSyp: 20000, engine: POLICY_VERSION },
  ]);
  assert.equal(allocate(120000, invoices).unappliedSyp, 20000);
  assert.equal(allocate(120000, invoices).allocatedSyp, 100000);
  assert.equal(invoices[0].outstandingSyp, 70000, 'pure calculation must not mutate source balances');
});
test('FIFO tie-breaking is stable, zero/empty invoices do not invent an allocation', () => {
  const at = '2026-11-06T10:00:00Z';
  assert.deepEqual(allocate(15, [row('b', at, 10), row('c', at, 0), row('a', at, 10)]).allocations,
    [{ invoiceId: 'a', amountSyp: 10, engine: POLICY_VERSION }, { invoiceId: 'b', amountSyp: 5, engine: POLICY_VERSION }]);
  assert.equal(allocate(15, []).unappliedSyp, 15);
});
test('FIFO rejects foreign accounts, duplicate invoices, invalid dates, money and unknown engine', () => {
  const at = '2026-11-06T10:00:00Z';
  for (const invoices of [
    [row('a', at, 10, { accountId: 'another-warehouse-account' })],
    [row('a', at, 10), row('a', at, 10)], [row('a', 'invalid', 10)],
    [row('a', at, -1)], [row('a', at, 0.5)], [row('a', at, 10, { engine: 'unknown' })],
  ]) assert.throws(() => allocate(10, invoices), { code: 'INVALID_COLLECTION_ACCOUNTING' });
  for (const amount of [0, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => allocate(amount, []));
  assert.throws(() => allocateOldestInvoices({ accountId: 'account-a', paymentSyp: 10, invoices: [], approval: true }));
});
test('partial collections earn only collected proportion, preserving the city and rural splits', () => {
  const city = collectionIncrement({ terms, previousCollectedSyp: 20000, collectedSyp: 50000 });
  assert.deepEqual(city.increment, { originalCommissionSyp: 3000, feniqSyp: 1500, repSyp: 1500, pharmacySyp: 0 });
  for (const areaType of ['city_ring', 'rural']) {
    const rural = collectionIncrement({ terms: { ...terms, areaType, deliveryFeeSyp: 9000 }, previousCollectedSyp: 0, collectedSyp: 50000 });
    assert.deepEqual(rural.increment, { originalCommissionSyp: 5000, feniqSyp: 5000, repSyp: 0, pharmacySyp: 0 });
  }
  assert.throws(() => collectionIncrement({ terms, previousCollectedSyp: 50000, collectedSyp: 49999 }));
  assert.throws(() => collectionIncrement({ terms, previousCollectedSyp: 0, collectedSyp: 100001 }));
});
test('many tiny receipts reconcile exactly to the frozen commission; no per-payment rounding drift', () => {
  for (const areaType of ['city', 'rural', 'city_ring']) {
    const invoiceTerms = { ...terms, areaType, invoiceSyp: 101, originalCommissionSyp: 37 };
    const total = { originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0, pharmacySyp: 0 };
    for (let i = 1; i <= 101; i++) {
      const { increment } = collectionIncrement({ terms: invoiceTerms, previousCollectedSyp: i - 1, collectedSyp: i });
      for (const key of Object.keys(total)) total[key] += increment[key];
    }
    assert.equal(total.originalCommissionSyp, 37);
    assert.equal(total.feniqSyp + total.repSyp, 37);
    assert.equal(total.feniqSyp, areaType === 'city' ? 19 : 37);
    assert.equal(total.pharmacySyp, 0);
  }
});
test('confirmed 10000 minus 2000 return reduces next settlement, preserving original settlement reference', () => {
  const result = correct({ settlementId: 'settled-original' });
  assert.equal(result.remaining.originalCommissionSyp, 8000);
  assert.deepEqual(result.correction, { originalCommissionSyp: -2000, feniqSyp: -1000, repSyp: -1000, pharmacySyp: 0 });
  assert.equal(result.treatment, 'offset_next_settlement');
  assert.equal(result.sourceSettlementId, 'settled-original');
  assert.equal(correct({}).treatment, 'correct_unsettled_entitlement');
});
test('before collection the return reduces potential, without generating a cash refund or earned reversal', () => {
  const result = correct({ collectedSyp: 0 });
  assert.equal(result.remaining.originalCommissionSyp, 8000);
  assert.deepEqual(result.correction, { originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0, pharmacySyp: 0 });
  assert.equal(result.treatment, 'reduce_future_entitlement');
  assert.throws(() => correct({ collectedSyp: 0, settlementId: 'not-possible' }));
});
test('cumulative return corrections sum exactly, including odd-lira city splits', () => {
  const invoiceTerms = { ...terms, invoiceSyp: 17, originalCommissionSyp: 7 };
  let feniq = 0, rep = 0;
  for (let i = 1; i <= 7; i++) {
    const { correction } = correct({ terms: invoiceTerms, collectedSyp: 17,
      previousReturnedCommissionSyp: i - 1, returnedCommissionSyp: i });
    feniq += correction.feniqSyp; rep += correction.repSyp;
  }
  assert.equal(feniq, -4); assert.equal(rep, -3);
  assert.deepEqual(correct({ previousReturnedCommissionSyp: 2000 }).correction,
    { originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0, pharmacySyp: 0 });
});
test('mixed partial receipt/return fails closed instead of choosing an unapproved formula', () => {
  assert.throws(() => correct({ collectedSyp: 50000 }), { code: 'PARTIAL_RETURN_REVIEW_REQUIRED' });
  assert.throws(() => correct({ returnedCommissionSyp: 10001 }));
  assert.throws(() => correct({ previousReturnedCommissionSyp: 2001 }));
  assert.throws(() => returnCommissionCorrection({ terms, collectedSyp: 100000,
    previousReturnedCommissionSyp: 0, returnedCommissionSyp: 2000, creditSyp: 20000 }));
});
test('Feniq transfer clock starts at actual cash time, crosses month boundaries, and allows early transfers', () => {
  const result = remittanceSchedule({ collector: 'feniq', paidAt: '2026-10-31T23:30:00+03:00' });
  assert.equal(result.paidAt, '2026-10-31T20:30:00.000Z');
  assert.equal(result.targetAt, '2026-11-01T20:30:00.000Z');
  assert.equal(result.dueAt, '2026-11-02T20:30:00.000Z');
  assert.equal(result.earlyTransferAllowed, true);
  assert.throws(() => remittanceSchedule({ collector: 'feniq', paidAt: result.paidAt, approvedAt: '2026-11-01T20:30:00Z' }));
});
test('warehouse settlement is weekly without inventing a weekday or rolling receipt due date', () => {
  const result = remittanceSchedule({ collector: 'warehouse', paidAt: '2026-11-06T10:00:00Z' });
  assert.equal(result.cadence, 'weekly'); assert.equal(result.calendarRequired, true); assert.equal(result.dueAt, null);
  for (const paidAt of [null, '', 'bad', 123]) assert.throws(() => remittanceSchedule({ collector: 'warehouse', paidAt }));
});
test('invalid calendar dates cannot silently move a remittance deadline or change FIFO order', () => {
  for (const paidAt of ['2026-02-30T10:00:00Z', '2026-02-29T10:00:00Z', '2026-04-31T10:00:00+03:00',
    '2026-11-06T24:00:00Z', '2026-11-06T10:00:60Z', '2026-11-06T10:00:00']) {
    assert.throws(() => remittanceSchedule({ collector: 'feniq', paidAt }), { code: 'INVALID_COLLECTION_ACCOUNTING' });
    assert.throws(() => allocate(10, [row('x', paidAt, 10)]), { code: 'INVALID_COLLECTION_ACCOUNTING' });
  }
  assert.equal(remittanceSchedule({ collector: 'feniq', paidAt: '2028-02-29T23:00:00-03:00' }).paidAt,
    '2028-03-01T02:00:00.000Z');
});
