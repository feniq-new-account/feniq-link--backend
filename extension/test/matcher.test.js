// node --test extension/test
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/matcher.js');

const catalog = require('../data/demo-catalog.json').map((x, i) => ({
  id: 'd' + i, name: x.n, maker: x.m, generic: x.c, strength: x.s, form: x.f, price: 1000, available: true,
}));
const index = M.buildIndex(catalog);
const first = (text) => {
  const line = M.parseLine(text);
  const r = M.matchLine(line, index);
  return { ...r, name: r.chosen && r.chosen.name };
};

test('يحوّل الأرقام العربية ويقرأ الكمية من البداية', () => {
  const r = first('٢ بخاخ سالبوتامول');
  assert.equal(r.qty, 2);
  assert.equal(r.name, 'ALLIED SALBUTAMOL SPRAY');
  assert.equal(r.status, 'ok');
});

test('يفهم البونص 10+1', () => {
  const r = first('امبروكسول شراب 10+1');
  assert.equal(r.qty, 10);
  assert.equal(r.bonus, 1);
  assert.equal(r.name, 'AMBROXOL SYRUP');
});

test('الرقم الأخير عيار عندما يطابق عيار الصنف', () => {
  const r = first('املاد 5');
  assert.equal(r.name, 'AMLAD -5 TAB.');
  assert.equal(r.qty, 1);
});

test('الرقم الأخير كمية عندما لا يكون عياراً', () => {
  const r = first('الفازار 100 × ٣');
  assert.equal(r.name, 'ALPHAZAR-100 CTD TAB.');
  assert.equal(r.qty, 3);
});

test('المثنى: علبتين = 2', () => {
  assert.equal(M.parseLine('غليميبيريد 3 علبتين').qty, 2);
});

test('كمية بالكلمات', () => {
  assert.equal(M.parseLine('تلاته سالبوتامول بخاخ').qty, 3);
});

test('التحيات لا تصبح أصنافاً', () => {
  assert.equal(M.parseOrder('مرحبا، بدي طلبية لو سمحت\nشكرا').length, 0);
});

test('صنف غير موجود في الكتالوج لا يُطابق بثقة', () => {
  const r = first('بنادول اكسترا 4');
  assert.notEqual(r.status, 'ok');
});

test('عشرون ألف بالكتابة السورية', () => {
  assert.deepEqual(M.numbersIn('20.000IU'), ['20000']);
});
