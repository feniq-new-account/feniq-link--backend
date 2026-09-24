// utils/bonus.js and utils/importValues.js - pure parsing, no database
// (catalog overhaul §8.1, §4.1-4.2).
const test = require('node:test');
const assert = require('node:assert');
const { parseBonus, freeQuantityFor, normalizeBonusTiers, formatBonus } = require('../src/utils/bonus');
const { parsePriceCell, resolveRowCurrency } = require('../src/utils/importValues');
const { fieldForHeader } = require('../src/config/importSynonyms');

const tiers = (text) => {
  const result = parseBonus(text);
  assert.ok(result.ok, `expected "${text}" to parse`);
  return result.tiers.map((t) => [t.buy, t.free]);
};

test('bonus: the brief\'s spellings all read as buy 10 get 1', () => {
  for (const text of ['10+1', '10 + 1', '١٠+١', 'بونص 10+1', '10+1 بونص', '1+10', 'العرض 10:1', 'bonus 10+1']) {
    assert.deepStrictEqual(tiers(text), [[10, 1]], text);
  }
});

test('bonus: several tiers, any separator, sorted by the buy threshold', () => {
  assert.deepStrictEqual(tiers('10+1، 20+3'), [[10, 1], [20, 3]]);
  assert.deepStrictEqual(tiers('20+3 ; 10+1'), [[10, 1], [20, 3]]);
  assert.deepStrictEqual(tiers('10+1 | 20+3 / 50+10'), [[10, 1], [20, 3], [50, 10]]);
  assert.deepStrictEqual(tiers('10+1\n20+3'), [[10, 1], [20, 3]]);
});

test('bonus: 0, -, "لا يوجد" and empty mean no bonus', () => {
  for (const text of ['0', '-', 'لا يوجد', '', '  ', null, undefined]) assert.deepStrictEqual(tiers(text), [], String(text));
});

test('bonus: garbage is invalid, never guessed', () => {
  for (const text of ['abc', '10', '10+', '+1', '10++1', '10+1+2', '0+1', 'عشرة وواحد', '10+1، ثلاثة']) {
    assert.strictEqual(parseBonus(text).ok, false, text);
  }
});

test('bonus: free quantity - the highest reachable tier, floor(qty / buy) * free', () => {
  assert.strictEqual(freeQuantityFor([{ buy: 10, free: 1 }], 25).freeQuantity, 2);
  const two = [{ buy: 10, free: 1 }, { buy: 20, free: 3 }];
  assert.deepStrictEqual(freeQuantityFor(two, 45), { freeQuantity: 6, tier: { buy: 20, free: 3 } });
  assert.strictEqual(freeQuantityFor(two, 19).freeQuantity, 1);
  assert.strictEqual(freeQuantityFor(two, 9).freeQuantity, 0);
  assert.strictEqual(freeQuantityFor([], 100).freeQuantity, 0);
});

test('bonus: structured tiers are validated the same way', () => {
  assert.deepStrictEqual(normalizeBonusTiers([{ buy: 1, free: 10 }]).tiers, [{ buy: 10, free: 1 }]);
  assert.strictEqual(normalizeBonusTiers([{ buy: 0, free: 1 }]).ok, false);
  assert.strictEqual(normalizeBonusTiers([{ buy: 2.5, free: 1 }]).ok, false);
  assert.deepStrictEqual(normalizeBonusTiers(null).tiers, []);
  assert.strictEqual(normalizeBonusTiers(undefined).tiers, undefined);
  assert.strictEqual(formatBonus([{ buy: 10, free: 1 }, { buy: 20, free: 3 }]), '10+1، 20+3');
});

test('price cells: Arabic digits, thousands separators and currency text', () => {
  assert.strictEqual(parsePriceCell('1,500').value, 1500);
  assert.strictEqual(parsePriceCell('١٬٥٠٠').value, 1500);
  assert.deepStrictEqual(parsePriceCell('13000 ل.س'), { value: 13000, currencyMarker: 'SYP' });
  assert.deepStrictEqual(parsePriceCell('$2.5'), { value: 2.5, currencyMarker: 'USD' });
  assert.deepStrictEqual(parsePriceCell('2.5 دولار'), { value: 2.5, currencyMarker: 'USD' });
  assert.strictEqual(parsePriceCell(7.25).value, 7.25);
  assert.strictEqual(parsePriceCell(0).value, 0);
  assert.strictEqual(parsePriceCell('ثلاثة').value, null);
  assert.strictEqual(parsePriceCell('').empty, true);
});

test('currency is mandatory: column, else a marker in the price cell, else review', () => {
  assert.deepStrictEqual(resolveRowCurrency('ليرة سورية', null), { currency: 'SYP' });
  assert.deepStrictEqual(resolveRowCurrency('S.P', null), { currency: 'SYP' });
  assert.deepStrictEqual(resolveRowCurrency('US', null), { currency: 'USD' });
  assert.deepStrictEqual(resolveRowCurrency('', 'USD'), { currency: 'USD' });
  assert.deepStrictEqual(resolveRowCurrency('', null), { problem: 'missing_currency' });
  assert.deepStrictEqual(resolveRowCurrency('يورو', null), { problem: 'unknown_currency' });
});

test('header synonyms match after normalization, including headers that contain one', () => {
  assert.strictEqual(fieldForHeader('اسم الصنف'), 'name');
  assert.strictEqual(fieldForHeader('Product Name'), 'name');
  assert.strictEqual(fieldForHeader('السعر الإفرادي'), 'price');
  assert.strictEqual(fieldForHeader('الشركه المصنعه'), 'manufacturer');
  assert.strictEqual(fieldForHeader('الشكل الصيدلاني'), 'unit');
  assert.strictEqual(fieldForHeader('العرض'), 'bonus');
  assert.strictEqual(fieldForHeader('Currency'), 'currency');
  assert.strictEqual(fieldForHeader('ملاحظات'), null);
});
