const test = require('node:test');
const assert = require('node:assert');
const { strengthKeyOf, formKeyOf } = require('../src/utils/medicineKeys');

test('strength: the dosage-form suffix is not part of the strength', () => {
  const key = '400mg';
  for (const text of ['400 MG/TAB.', '400 MG/CTD TAB.', '400MG/F.CTD TAB.', '400 mg', ' 400  MG / TAB ']) {
    assert.strictEqual(strengthKeyOf(text), key, text);
  }
  assert.strictEqual(strengthKeyOf('10 MG/SOFT G.CAP.'), '10mg');
});

test('strength: a concentration keeps its volume, and per 1 ml equals per ml', () => {
  assert.strictEqual(strengthKeyOf('125 MG/5 ML.'), '125mg/5ml');
  assert.notStrictEqual(strengthKeyOf('125 MG/5 ML.'), strengthKeyOf('250 MG/5 ML.'));
  assert.strictEqual(strengthKeyOf('1 MG/ML.'), strengthKeyOf('1 MG/1 ML.'));
});

test('strength: combinations and percentages', () => {
  assert.strictEqual(strengthKeyOf('1000MG+50MG/CTD TAB.'), strengthKeyOf('1000 MG+50 MG/CTD TAB.'));
  assert.strictEqual(strengthKeyOf('0.5 %'), '0.5%');
  assert.strictEqual(strengthKeyOf(''), null);
  assert.strictEqual(strengthKeyOf(null), null);
});

test('form: plain and coated tablets (and capsules) are one kind, other forms are not', () => {
  assert.strictEqual(formKeyOf('أقراص'), formKeyOf('أقراص ملبسة'));
  assert.strictEqual(formKeyOf('محافظ'), formKeyOf('محافظ جيلاتينية طرية'));
  assert.notStrictEqual(formKeyOf('أقراص'), formKeyOf('أقراص مديدة التحرر'));
  assert.notStrictEqual(formKeyOf('قطرة عينية'), formKeyOf('كريم'));
  assert.strictEqual(formKeyOf(undefined), null);
});
