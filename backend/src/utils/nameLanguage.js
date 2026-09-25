// A name "is Arabic" when it contains Arabic letters (the Arabic block and its
// presentation forms). Digits and punctuation are neither, so "500" alone is
// not Arabic. Used where an Arabic name is required and a raw name may have
// been written in English - approving a catalog request raised as
// "Metformin 850" needs an Arabic name first (catalogRequest.service.js).
const ARABIC_LETTER = /[\u0621-\u064A\u0671-\u06D3\u06FA-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function isArabicName(text) {
  return typeof text === 'string' && ARABIC_LETTER.test(text);
}

module.exports = { isArabicName };
