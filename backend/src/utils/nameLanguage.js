// Names in one language only (catalog overhaul, pre-merge review). A catalog
// item needs at least one name - Arabic or English - and a raw name typed in
// one field (an import cell, a request) is filed under the language it is
// written in.

// Arabic letters (the Arabic block and its presentation forms). Digits and
// punctuation are neither, so "500" alone is not Arabic.
const ARABIC_LETTER = /[ء-يٱ-ۓۺ-ۿﭐ-﷿ﹰ-﻿]/;

// A name containing Arabic letters is Arabic, otherwise English.
function isArabicName(text) {
  return typeof text === 'string' && ARABIC_LETTER.test(text);
}

function clean(text) {
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

// One raw name -> { nameAr, nameEn }, exactly one of them set (both null for
// an empty name).
function splitNameByLanguage(text) {
  const name = clean(text);
  if (!name) return { nameAr: null, nameEn: null };
  return isArabicName(name) ? { nameAr: name, nameEn: null } : { nameAr: null, nameEn: name };
}

// Several raw names (a row's two name columns, a form's two fields) -> the
// first Arabic one as nameAr and the first other one as nameEn.
function namesByLanguage(...texts) {
  const names = { nameAr: null, nameEn: null };
  for (const text of texts) {
    const { nameAr, nameEn } = splitNameByLanguage(text);
    if (nameAr && !names.nameAr) names.nameAr = nameAr;
    if (nameEn && !names.nameEn) names.nameEn = nameEn;
  }
  return names;
}

// The name to put in a server-built text (a message, a report), which has no
// UI language of its own: the Arabic one, else the English one.
function anyName(nameAr, nameEn) {
  return clean(nameAr) ?? clean(nameEn) ?? '';
}

module.exports = { isArabicName, splitNameByLanguage, namesByLanguage, anyName };
