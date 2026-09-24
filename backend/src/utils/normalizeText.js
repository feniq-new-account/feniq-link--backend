// The one comparable form of a name. Every place that compares or searches a
// medicine or manufacturer name (the catalog's stored search keys, the Excel
// import's matching, the pharmacist/warehouse/admin searches, the import's
// header detection) goes through this, so two spellings the same person would
// read as the same word always land on the same key.
//
// Deliberately NOT cityMatch.js's normalizeCity: that one also strips every
// space and the Arabic article, which is right for one-word city names and
// wrong for medicine names ("فيتامين سي" must stay two tokens).
//
// Rules, in order:
//  - Latin is lowercased (Arabic is caseless).
//  - Tashkeel (U+064B-U+0652), the superscript alef (U+0670) and tatweel
//    (U+0640) are removed - they never change which word it is.
//  - Letter forms that differ only by spelling convention are unified:
//    أ إ آ ٱ -> ا, ة -> ه, ى -> ي, ؤ -> و, ئ -> ي.
//  - Arabic-Indic (٠-٩) and extended Arabic-Indic (۰-۹) digits become 0-9.
//  - Common punctuation (- _ . , / ( ) and the Arabic comma/semicolon) reads
//    as a space, so "Co-Amoxiclav" and "Co Amoxiclav" meet.
//  - Whitespace is collapsed and trimmed.
//
// A non-string (null, undefined, a number that slipped through) yields ''.

const MARKS = /[ً-ْٰـ]/g;
const ALEF_VARIANTS = /[أإآٱ]/g;
const PUNCTUATION = /[-_.,/()،؛]/g;
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

function toWesternDigit(char) {
  const code = char.charCodeAt(0);
  if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
    return String(code - ARABIC_INDIC_ZERO);
  }
  return String(code - EXTENDED_ARABIC_INDIC_ZERO);
}

// Exported on its own for the numeric parsers (import prices, bonus tiers),
// which need the digits converted without the rest of the name rules.
function toWesternDigits(value) {
  return value.replace(/[٠-٩۰-۹]/g, toWesternDigit);
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return toWesternDigits(value)
    .toLowerCase()
    .replace(MARKS, '')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizeText, toWesternDigits };
