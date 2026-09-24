const { normalizeText } = require('../utils/normalizeText');

// The fixed list of pharmaceutical units a warehouse product can be sold in.
// The code is what is stored (Product.unit) and sent over the API; the Arabic
// label is what every screen shows. `synonyms` are what the Excel import and
// any free-text entry are matched against - after normalizeText(), so they are
// written here in their natural spelling and compared in normalized form.
//
// To accept a new spelling, add it to the relevant `synonyms` list. To add a
// unit, add an entry - the code becomes valid everywhere (model enum, import,
// web dropdowns via GET /units) with nothing else to edit.
const UNITS = [
  { code: 'box', nameEn: 'Box', nameAr: 'علبة', synonyms: ['علبة', 'عبوة', 'box', 'pack', 'pkt'] },
  { code: 'injection', nameEn: 'Injection', nameAr: 'حقنة', synonyms: ['حقنة', 'حقن', 'inj', 'injection', 'syringe'] },
  { code: 'ampoule', nameEn: 'Ampoule', nameAr: 'أمبولة', synonyms: ['أمبولة', 'امبول', 'amp', 'ampoule'] },
  { code: 'vial', nameEn: 'Vial', nameAr: 'فيال', synonyms: ['فيال', 'فيالة', 'vial'] },
  { code: 'strip', nameEn: 'Strip', nameAr: 'شريط', synonyms: ['شريط', 'strip', 'blister'] },
  { code: 'bottle', nameEn: 'Bottle', nameAr: 'زجاجة', synonyms: ['زجاجة', 'قارورة', 'bottle', 'btl'] },
  { code: 'tube', nameEn: 'Tube', nameAr: 'أنبوب', synonyms: ['أنبوب', 'تيوب', 'مرهم', 'كريم', 'tube'] },
  { code: 'sachet', nameEn: 'Sachet', nameAr: 'كيس', synonyms: ['كيس', 'ظرف', 'sachet'] },
  { code: 'piece', nameEn: 'Piece', nameAr: 'قطعة', synonyms: ['قطعة', 'حبة', 'piece', 'pcs'] },
  { code: 'spray', nameEn: 'Spray', nameAr: 'بخاخ', synonyms: ['بخاخ', 'spray', 'inhaler'] },
  { code: 'suppository', nameEn: 'Suppository', nameAr: 'تحميلة', synonyms: ['تحميلة', 'تحاميل', 'supp', 'suppository'] },
];

const UNIT_CODES = UNITS.map((unit) => unit.code);

const UNIT_BY_SYNONYM = new Map();
for (const unit of UNITS) {
  UNIT_BY_SYNONYM.set(normalizeText(unit.code), unit.code);
  for (const synonym of unit.synonyms) {
    UNIT_BY_SYNONYM.set(normalizeText(synonym), unit.code);
  }
}

// Free text (an import cell, a legacy unitAr value) -> a unit code, or null
// when nothing matches. Callers decide what null means: the import sends the
// row to review, a blank cell simply means "no unit given".
function resolveUnit(value) {
  const key = normalizeText(value);
  if (!key) return null;
  return UNIT_BY_SYNONYM.get(key) ?? null;
}

function unitNameAr(code) {
  const unit = UNITS.find((entry) => entry.code === code);
  return unit ? unit.nameAr : null;
}

function unitNameEn(code) {
  const unit = UNITS.find((entry) => entry.code === code);
  return unit ? unit.nameEn : null;
}

module.exports = { UNITS, UNIT_CODES, resolveUnit, unitNameAr, unitNameEn };
