const { normalizeText, toWesternDigits } = require('./normalizeText');

// A production / expiry date out of an Excel cell, in whatever shape a
// warehouse keeps it: a real date cell, an Excel serial number, or text in any
// layout - 2027-03-15, 15/3/2027, 15-03-27, 03/2027, 3-27, 2027, "Mar 2027",
// "15 آذار 2027", "كانون الأول 2026", with Western or Arabic-Indic digits.
//
// Day first when it is a guess (the way this country writes dates): 05/06/2027
// is the 5th of June. A first or second part above 12 settles it either way.
// Only a month (or a year) is common on a pack ("EXP 03/2027"): an expiry
// then means the end of that month (end of the year for a bare year), a
// production date its start.
//
// Returns { empty: true } for a blank cell, { date } for a date (UTC midnight)
// and { date: null } when the cell holds something that is not a plausible
// date.

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const MONTH_NAMES = {
  1: ['يناير', 'كانون الثاني', 'جانفي', 'january', 'jan'],
  2: ['فبراير', 'شباط', 'فيفري', 'february', 'feb'],
  3: ['مارس', 'اذار', 'march', 'mar'],
  4: ['ابريل', 'نيسان', 'افريل', 'april', 'apr'],
  5: ['مايو', 'ايار', 'ماي', 'may'],
  6: ['يونيو', 'حزيران', 'جوان', 'june', 'jun'],
  7: ['يوليو', 'تموز', 'جويليه', 'july', 'jul'],
  8: ['اغسطس', 'اب', 'اوت', 'august', 'aug'],
  9: ['سبتمبر', 'ايلول', 'september', 'sept', 'sep'],
  10: ['اكتوبر', 'تشرين الاول', 'october', 'oct'],
  11: ['نوفمبر', 'تشرين الثاني', 'november', 'nov'],
  12: ['ديسمبر', 'كانون الاول', 'december', 'dec'],
};

const MONTH_BY_NAME = new Map();
for (const [month, names] of Object.entries(MONTH_NAMES)) {
  for (const name of names) MONTH_BY_NAME.set(normalizeText(name), Number(month));
}
// Longest names first, so "كانون الثاني" is found before a shorter name could
// match inside it.
const MONTH_NAMES_LONGEST_FIRST = [...MONTH_BY_NAME.keys()].sort((a, b) => b.length - a.length);

// Words printed next to a date on a pack or a sheet.
const IGNORED_WORDS = new Set(['exp', 'expiry', 'expires', 'expiration', 'mfg', 'mfd', 'prod', 'date', 'best', 'before', 'تاريخ']);

const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function make(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day !== null && (day < 1 || day > daysIn(year, month))) return null;
  return { year, month, day };
}

const toYear = (text) => (text.length <= 2 ? 2000 + Number(text) : Number(text));

// "15 mar 2027" -> "15 3 2027"; unknown words stay as they are.
function replaceMonthNames(text) {
  let key = normalizeText(text);
  for (const name of MONTH_NAMES_LONGEST_FIRST) {
    const pattern = new RegExp(`(^| )${name}( |$)`, 'g');
    key = key.replace(pattern, (_, before, after) => `${before}${MONTH_BY_NAME.get(name)}${after}`);
  }
  return key;
}

// The parts of a date text: { year, month, day|null } or null.
function partsFromText(text) {
  const key = replaceMonthNames(toWesternDigits(String(text)).replace(/[:؛;]/g, ' '));
  const numbers = key.split(' ').filter((word) => word && !IGNORED_WORDS.has(word));
  if (numbers.length === 0 || numbers.some((n) => !/^\d+$/.test(n))) return null;

  if (numbers.length === 1) {
    const [n] = numbers;
    if (n.length === 4) return make(Number(n), 12, null);
    // 20270315 / 15032027 written without separators.
    if (n.length === 8) {
      return n.startsWith('19') || n.startsWith('20')
        ? make(Number(n.slice(0, 4)), Number(n.slice(4, 6)), Number(n.slice(6)))
        : make(Number(n.slice(4)), Number(n.slice(2, 4)), Number(n.slice(0, 2)));
    }
    return null;
  }

  if (numbers.length === 2) {
    const [a, b] = numbers;
    // 2027-03 / 03-2027 / 3-27
    if (a.length === 4) return make(Number(a), Number(b), null);
    if (b.length === 4) return make(Number(b), Number(a), null);
    // 3-27 is March 2027; 15/3 (a day and a month, no year) is not a date.
    return Number(a) <= 12 ? make(toYear(b), Number(a), null) : null;
  }

  if (numbers.length === 3) {
    const [a, b, c] = numbers;
    if (a.length === 4) return make(Number(a), Number(b), Number(c));
    // Day first, unless the middle part cannot be a month.
    if (Number(b) > 12 && Number(a) <= 12) return make(toYear(c), Number(a), Number(b));
    return make(toYear(c), Number(b), Number(a));
  }
  return null;
}

// An Excel serial number (days since 1899-12-30).
function dateFromSerial(serial) {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  return new Date(Math.round((serial - 25569) * 86400000));
}

function cellValue(value) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('result' in value) return value.result;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return value.text;
  }
  return value;
}

function atEndOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

// kind: 'production' | 'expiry'. `monthOnlyFormat`: the cell is formatted as
// month/year only (mm/yyyy), so a date there stands for the whole month.
function parseDateCell(rawValue, { kind = 'expiry', monthOnlyFormat = false } = {}) {
  const value = cellValue(rawValue);
  if (value === null || value === undefined || value === '') return { empty: true };
  if (typeof value === 'string' && !value.trim()) return { empty: true };

  let date = null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { date: null };
    date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    if (monthOnlyFormat && kind === 'expiry') date = atEndOfMonth(date);
  } else if (typeof value === 'number') {
    date = dateFromSerial(value);
    if (!date && Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR) {
      date = new Date(Date.UTC(value, kind === 'expiry' ? 11 : 0, kind === 'expiry' ? 31 : 1));
    }
  } else {
    const parts = partsFromText(value);
    if (parts) {
      const asYearOnly = parts.day === null && parts.month === 12 && /^\s*\d{4}\s*$/.test(toWesternDigits(String(value)));
      let { day } = parts;
      if (day === null) {
        if (kind === 'expiry') day = daysIn(parts.year, parts.month);
        else day = 1;
      }
      let month = parts.month;
      if (asYearOnly && kind === 'production') month = 1;
      date = new Date(Date.UTC(parts.year, month - 1, day));
    }
  }
  if (!date || Number.isNaN(date.getTime())) return { date: null };
  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) return { date: null };
  return { date };
}

module.exports = { parseDateCell };
