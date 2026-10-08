// A production / expiry date out of an Excel cell, in any shape.
const test = require('node:test');
const assert = require('node:assert');
const { parseDateCell } = require('../src/utils/dateCell');

const iso = (result) => (result.date ? result.date.toISOString().slice(0, 10) : result.date);
const expiry = (value, opts) => iso(parseDateCell(value, { kind: 'expiry', ...opts }));
const production = (value, opts) => iso(parseDateCell(value, { kind: 'production', ...opts }));

test('a blank cell is empty, not a bad date', () => {
  for (const value of [null, undefined, '', '   ']) assert.deepStrictEqual(parseDateCell(value), { empty: true });
});

test('a real date cell is taken as it is', () => {
  assert.strictEqual(expiry(new Date(Date.UTC(2027, 2, 15))), '2027-03-15');
  assert.strictEqual(expiry(new Date('2027-03-01T00:00:00Z'), { monthOnlyFormat: true }), '2027-03-31');
  assert.strictEqual(production(new Date('2027-03-01T00:00:00Z'), { monthOnlyFormat: true }), '2027-03-01');
});

test('an Excel serial number', () => {
  assert.strictEqual(expiry(46461), '2027-03-15'); // 2027-03-15
  assert.strictEqual(expiry(2027), '2027-12-31');
  assert.strictEqual(production(2027), '2027-01-01');
});

test('full dates in any order and separator, day first when it is a guess', () => {
  assert.strictEqual(expiry('2027-03-15'), '2027-03-15');
  assert.strictEqual(expiry('2027/3/5'), '2027-03-05');
  assert.strictEqual(expiry('15/3/2027'), '2027-03-15');
  assert.strictEqual(expiry('15-03-27'), '2027-03-15');
  assert.strictEqual(expiry('15.03.2027'), '2027-03-15');
  assert.strictEqual(expiry('05/06/2027'), '2027-06-05');
  assert.strictEqual(expiry('03/15/2027'), '2027-03-15'); // 15 cannot be a month
  assert.strictEqual(expiry('20270315'), '2027-03-15');
  assert.strictEqual(expiry('15032027'), '2027-03-15');
});

test('Arabic-Indic digits', () => {
  assert.strictEqual(expiry('١٥/٠٣/٢٠٢٧'), '2027-03-15');
  assert.strictEqual(expiry('٢٠٢٧-٠٣'), '2027-03-31');
});

test('month and year only: the end of the month for an expiry, the start for a production date', () => {
  assert.strictEqual(expiry('03/2027'), '2027-03-31');
  assert.strictEqual(expiry('2027-02'), '2027-02-28');
  assert.strictEqual(expiry('2/2028'), '2028-02-29');
  assert.strictEqual(expiry('3-27'), '2027-03-31');
  assert.strictEqual(production('03/2027'), '2027-03-01');
  assert.strictEqual(expiry('2027'), '2027-12-31');
  assert.strictEqual(production('2027'), '2027-01-01');
});

test('month names, English and Arabic (Levantine too)', () => {
  assert.strictEqual(expiry('15 Mar 2027'), '2027-03-15');
  assert.strictEqual(expiry('March 2027'), '2027-03-31');
  assert.strictEqual(expiry('Mar-27'), '2027-03-31');
  assert.strictEqual(expiry('15 آذار 2027'), '2027-03-15');
  assert.strictEqual(expiry('كانون الأول 2026'), '2026-12-31');
  assert.strictEqual(expiry('تشرين الثاني 2026'), '2026-11-30');
  assert.strictEqual(expiry('أيلول 2027'), '2027-09-30');
  assert.strictEqual(expiry('1 مارس 2027'), '2027-03-01');
});

test('words printed beside the date are ignored', () => {
  assert.strictEqual(expiry('EXP 03/2027'), '2027-03-31');
  assert.strictEqual(production('MFG: 2025-01-10'), '2025-01-10');
  assert.strictEqual(expiry('تاريخ 15/3/2027'), '2027-03-15');
});

test('anything that is not a plausible date is bad, never guessed', () => {
  for (const value of ['hello', '31/02/2027', '2027-13-01', '15/3', '1999', '2200', 'N/A', '12345678901']) {
    assert.strictEqual(parseDateCell(value).date, null, value);
  }
});
