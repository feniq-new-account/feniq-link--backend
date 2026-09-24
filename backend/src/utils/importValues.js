const { toWesternDigits, normalizeText } = require('./normalizeText');
const { CURRENCY_BY_TOKEN, currencyForText } = require('../config/importSynonyms');

// Reading the numbers and currencies warehouses actually type into a price
// cell: "13,000", "١٣٬٠٠٠", "13000 ل.س", "$2.5", "2.5 دولار", or a
// number-typed cell.

// Arabic thousands separator (U+066C) and decimal separator (U+066B).
const ARABIC_THOUSANDS = /٬/g;
const ARABIC_DECIMAL = /٫/g;

// Finds a currency written INSIDE the price cell ("13000 ل.س", "$3").
// Returns 'SYP' | 'USD' | null.
function currencyMarkerIn(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  if (text.includes('$')) return 'USD';
  const letters = normalizeText(toWesternDigits(text).replace(/[\d.,٬٫]+/g, ' '));
  if (!letters) return null;
  if (CURRENCY_BY_TOKEN.has(letters)) return CURRENCY_BY_TOKEN.get(letters);
  for (const token of letters.split(' ')) {
    if (CURRENCY_BY_TOKEN.has(token)) return CURRENCY_BY_TOKEN.get(token);
  }
  return null;
}

// A price cell -> { value, currencyMarker } | { value: null } when it is not a
// number. `value` is a finite number >= 0. A comma is a thousands separator
// unless it is the only separator AND is followed by 1-2 digits ("2,5" -> 2.5
// is ambiguous in a Syrian price list; treated as decimal only then).
function parsePriceCell(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? { value: raw, currencyMarker: null } : { value: null };
  }
  if (raw === undefined || raw === null) return { value: null, empty: true };
  const text = String(raw).trim();
  if (!text) return { value: null, empty: true };

  const currencyMarker = currencyMarkerIn(text);
  let numeric = toWesternDigits(text).replace(ARABIC_THOUSANDS, ',').replace(ARABIC_DECIMAL, '.');
  // Letters go first; a separator left dangling at either end came from the
  // currency text itself ("13000 ل.س" -> "13000.").
  numeric = numeric.replace(/[^\d.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  if (!numeric) return { value: null, currencyMarker };

  const commas = (numeric.match(/,/g) || []).length;
  const dots = (numeric.match(/\./g) || []).length;
  if (commas > 0 && dots === 0 && commas === 1 && /,\d{1,2}$/.test(numeric)) {
    numeric = numeric.replace(',', '.');
  } else {
    numeric = numeric.replace(/,/g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(numeric)) return { value: null, currencyMarker };
  const value = Number(numeric);
  return Number.isFinite(value) ? { value, currencyMarker } : { value: null, currencyMarker };
}

// The row's currency: the currency column when it has a value, otherwise a
// marker inside the price cell. Currency is MANDATORY (project owner's
// decision): { currency: 'SYP'|'USD' } or { problem: 'unknown_currency' |
// 'missing_currency' }.
function resolveRowCurrency(currencyCell, priceMarker) {
  const fromColumn = currencyForText(currencyCell);
  if (fromColumn === 'SYP' || fromColumn === 'USD') return { currency: fromColumn };
  if (fromColumn === null) return { problem: 'unknown_currency' };
  if (priceMarker) return { currency: priceMarker };
  return { problem: 'missing_currency' };
}

module.exports = { parsePriceCell, currencyMarkerIn, resolveRowCurrency };
