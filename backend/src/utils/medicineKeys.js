const { normalizeText } = require('./normalizeText');

// What makes two catalog items interchangeable at the pharmacy counter: the
// same active ingredient, the same strength and the same kind of dosage form.
// The three keys below are stored on the catalog item (productCatalog.model.js)
// so "find the alternatives" is one indexed equality query.

// Units a strength is measured against - "125 MG/5 ML" keeps its "/5 ML".
const MEASURE_UNITS = new Set(['ml', 'g', 'l', 'mg', 'mcg', 'iu', 'dose']);

// The Ministry's strength text ends in the dosage form it is per ("400 MG/TAB.",
// "10 MG/CTD TAB.", "10 MG/SOFT G.CAP."). That suffix is the form, which has its
// own key - so it is cut off, leaving "400mg" for all three spellings of a tablet.
// A suffix that is a quantity ("/5 ML.", "/1 ML.") is part of the strength and
// stays, except that "per 1 ml" and "per ml" are the same concentration.
function strengthKeyOf(value) {
  if (typeof value !== 'string') return null;
  let key = value.toLowerCase().replace(/\s+/g, '').replace(/[.,]+$/, '');
  if (!key) return null;
  key = key.replace(/\/1(ml|g|l)$/, '/$1');
  const slash = key.lastIndexOf('/');
  if (slash > 0) {
    const suffix = key.slice(slash + 1).replace(/\.+$/, '');
    if (/^[a-z.]+$/.test(suffix) && !MEASURE_UNITS.has(suffix)) key = key.slice(0, slash);
  }
  return key.replace(/\.+$/, '') || null;
}

// Plain and coated tablets, and plain and soft-gel capsules, are the same thing
// to a pharmacist choosing a substitute; every other form (extended release,
// effervescent, eye drops vs cream, ...) stays its own.
function formKeyOf(value) {
  const key = normalizeText(typeof value === 'string' ? value : '');
  if (!key) return null;
  if (key === 'اقراص' || key === 'اقراص ملبسه') return 'tablet';
  if (key === 'محافظ' || key === 'محافظ جيلاتينيه طريه') return 'capsule';
  return key;
}

module.exports = { strengthKeyOf, formKeyOf };
