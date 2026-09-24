// utils/normalizeText.js - the one comparable form of every medicine and
// manufacturer name (catalog overhaul §1.1). Pure function, no database.
const test = require('node:test');
const assert = require('node:assert');
const { normalizeText, toWesternDigits } = require('../src/utils/normalizeText');
const { resolveUnit, UNIT_CODES } = require('../src/config/units');

const same = (a, b) => assert.strictEqual(normalizeText(a), normalizeText(b), `${a} vs ${b}`);
const different = (a, b) => assert.notStrictEqual(normalizeText(a), normalizeText(b), `${a} vs ${b}`);

test('hamza forms of alef all read as bare alef', () => {
  same('اموكسيسيلين', 'أموكسيسيلين');
  same('إيبوبروفين', 'ايبوبروفين');
  same('آمبول', 'امبول');
  same('ٱلشرق', 'الشرق');
});

test('ta marbuta, alef maksura, waw- and ya-hamza are unified', () => {
  same('شركة', 'شركه');
  same('مستشفى', 'مستشفي');
  same('مؤسسة', 'موسسه');
  same('دوائية', 'دواييه');
});

test('tashkeel, the superscript alef and tatweel are removed', () => {
  same('دَوَاءٌ', 'دواء');
  same('الرحمٰن', 'الرحمن');
  same('شـــركة', 'شركة');
});

test('Arabic-Indic and extended Arabic-Indic digits become Western digits', () => {
  assert.strictEqual(normalizeText('بانادول ٥٠٠'), 'بانادول 500');
  assert.strictEqual(normalizeText('۱۲۳'), '123');
  assert.strictEqual(toWesternDigits('١٠+١'), '10+1');
});

test('whitespace is collapsed and trimmed', () => {
  same('شركة  الشرق', 'شركة الشرق');
  assert.strictEqual(normalizeText('  فيتامين \t سي \n'), 'فيتامين سي');
});

test('common punctuation reads as a space', () => {
  same('Co-Amoxiclav', 'co amoxiclav');
  same('Vitamin_C', 'vitamin c');
  same('Panadol (Extra)', 'panadol extra');
  same('A/B.C,D', 'a b c d');
  same('شركة، الشرق', 'شركة الشرق');
});

test('Latin is lowercased; Arabic is left otherwise intact', () => {
  assert.strictEqual(normalizeText('PANADOL Extra'), 'panadol extra');
  assert.strictEqual(normalizeText('باراسيتامول'), 'باراسيتامول');
});

test('different words stay different', () => {
  different('باراسيتامول', 'ايبوبروفين');
  different('فيتامين سي', 'فيتامينسي');
  different('Panadol 500', 'Panadol 50');
});

test('a non-string yields an empty string, never throws', () => {
  for (const value of [null, undefined, 42, {}, []]) assert.strictEqual(normalizeText(value), '');
});

test('units resolve from their Arabic and English synonyms, normalized', () => {
  assert.strictEqual(resolveUnit('علبة'), 'box');
  assert.strictEqual(resolveUnit('عبوه'), 'box');
  assert.strictEqual(resolveUnit(' PKT '), 'box');
  assert.strictEqual(resolveUnit('امبولة'), 'ampoule');
  assert.strictEqual(resolveUnit('مرهم'), 'tube');
  assert.strictEqual(resolveUnit('Inhaler'), 'spray');
  assert.strictEqual(resolveUnit('تحاميل'), 'suppository');
  assert.strictEqual(resolveUnit('suppository'), 'suppository');
  assert.strictEqual(resolveUnit('كرتونة'), null);
  assert.strictEqual(resolveUnit(''), null);
  assert.strictEqual(UNIT_CODES.length, 11);
});
