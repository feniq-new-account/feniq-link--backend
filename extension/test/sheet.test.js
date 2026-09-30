const test = require('node:test');
const assert = require('node:assert');
const { parseSheet } = require('../src/sheet.js');

test('يتعرّف على الأعمدة العربية من سطر العناوين', () => {
  const { items, columns } = parseSheet('الاسم\tالسعر\tمتوفر\tالشركة\nAMBROXOL SYRUP\t8,500\tنعم\tفارماسير\nAMLAD-5 TAB.\t١٢٠٠٠\t0\tبحري');
  assert.deepEqual(Object.keys(columns).sort(), ['available', 'maker', 'name', 'price']);
  assert.equal(items.length, 2);
  assert.equal(items[0].price, 8500);
  assert.equal(items[1].price, 12000);
  assert.equal(items[1].available, false);
});

test('بلا عناوين: العمود الأول اسم وأول رقم سعر', () => {
  const { items } = parseSheet('PANADOL 500,4500\nAUGMENTIN 1G,21000');
  assert.equal(items.length, 2);
  assert.equal(items[1].name, 'AUGMENTIN 1G');
  assert.equal(items[1].price, 21000);
});
