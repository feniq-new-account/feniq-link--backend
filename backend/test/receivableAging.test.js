const test = require('node:test');
const assert = require('node:assert/strict');
const { ageAccount } = require('../src/utils/receivableAging');
const now = new Date('2026-10-29T10:00:00Z');
const row = (id, direction, amountSyp, date, extra = {}) => ({ _id: id, direction, amountSyp,
  kind: direction === 'debit' ? 'charge' : 'payment', sequence: Number(id.replace(/\D/g, '')) || 1,
  effectiveAt: new Date(date), ...extra });
test('a small recent payment does not make the entire old debt young', () => {
  const result = ageAccount([row('1', 'debit', 10000, '2026-10-01'), row('2', 'debit', 5000, '2026-10-28'),
    row('3', 'credit', 1000, '2026-10-29')], { now });
  assert.equal(result.debtSyp, 14000);
  assert.equal(result.overdueSyp, 9000);
  assert.deepEqual(result.buckets, [5000, 9000, 0, 0]);
});
test('a return reduces its own newer invoice before payments settle the old invoice', () => {
  const result = ageAccount([row('1', 'debit', 10000, '2026-10-01', { source: { orderId: 'old' } }),
    row('2', 'debit', 5000, '2026-10-28', { source: { orderId: 'new' } }),
    row('3', 'credit', 5000, '2026-10-29', { kind: 'return_credit', metadata: { orderId: 'new' } }),
    row('4', 'credit', 1000, '2026-10-29')], { now });
  assert.equal(result.debtSyp, 9000); assert.equal(result.overdueSyp, 9000);
});
test('reversing a payment restores the original invoice age rather than the reversal date', () => {
  const result = ageAccount([row('1', 'debit', 10000, '2026-09-01'), row('2', 'credit', 10000, '2026-10-28'),
    row('3', 'debit', 10000, '2026-10-29', { kind: 'payment_reversal', reversalOf: '2' })], { now });
  assert.deepEqual(result.buckets, [0, 0, 10000, 0]);
  assert.equal(result.oldestAgeDays, 58);
});
test('credit held is distinct from debt and cannot become a negative aging bucket', () => {
  const result = ageAccount([row('1', 'debit', 1000, '2026-10-01'), row('2', 'credit', 5000, '2026-10-02')], { now });
  assert.equal(result.debtSyp, 0); assert.equal(result.creditSyp, 4000); assert.equal(result.overdueSyp, 0);
});
test('the configured overdue boundary uses Damascus calendar days', () => {
  const result = ageAccount([row('1', 'debit', 1000, '2026-10-13T21:30:00Z')], { now, overdueDays: 15 });
  assert.equal(result.oldestAgeDays, 15); assert.equal(result.overdueSyp, 1000);
});

test('opening balances and manual debits are included in debt without inventing invoice age', () => {
  const result = ageAccount([row('1', 'debit', 10000, '2026-01-01', { kind: 'opening_balance' }),
    row('2', 'debit', 2000, '2026-01-02', { kind: 'manual_debit' }), row('3', 'debit', 5000, '2026-10-01')], { now });
  assert.equal(result.debtSyp, 17000); assert.equal(result.unknownAgeSyp, 12000);
  assert.equal(result.overdueSyp, 5000); assert.equal(result.oldestAgeDays, 28);
  assert.equal(result.buckets.reduce((a, b) => a + b, 0) + result.unknownAgeSyp, result.debtSyp);
});
test('account payments reduce the older unknown opening lot without changing known invoice dates', () => {
  const result = ageAccount([row('1', 'debit', 10000, '2026-01-01', { kind: 'opening_balance' }),
    row('2', 'debit', 5000, '2026-10-01'), row('3', 'credit', 11000, '2026-10-29')], { now });
  assert.equal(result.unknownAgeSyp, 0); assert.equal(result.debtSyp, 4000); assert.equal(result.overdueSyp, 4000);
});
