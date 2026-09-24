const { normalizeText } = require('../utils/normalizeText');

// The Excel import's vocabulary - which header text means which column, and
// which cell text means which currency. Written in natural spelling; every
// comparison happens after normalizeText(), so hamza/ta-marbuta/spacing
// variants of these all match. To accept a new header or currency spelling,
// add it here - nothing else needs to change.
//
// Note: warehouses head their bonus column "العرض". In the import that
// column is the BONUS, never an Offer.
const FIELD_SYNONYMS = {
  name: [
    'اسم المادة', 'المادة', 'اسم الدواء', 'الدواء', 'الاسم', 'اسم الصنف', 'الصنف', 'البيان',
    'اسم الدواء (من القائمة)',
    // A file with a separate English column heads the Arabic one like this.
    'الاسم العربي', 'اسم المادة بالعربي', 'الاسم عربي',
    'name', 'product', 'product name', 'item', 'item name', 'drug',
  ],
  // Optional second name column. With a name column too, the row is matched
  // on that one first and on this one second; on its own it IS the name
  // column (productCatalog.service.js's readImportWorkbook).
  nameEn: ['الاسم الانكليزي', 'الاسم الإنجليزي', 'الاسم الاجنبي', 'english name', 'name en'],
  price: ['السعر', 'سعر', 'سعر المبيع', 'السعر الافرادي', 'السعر (دولار)', 'price', 'unit price', 'cost'],
  manufacturer: [
    'الشركة', 'شركة', 'اسم الشركة', 'الشركة المصنعة', 'المصنع',
    'company', 'manufacturer', 'mfr', 'brand',
  ],
  // The admin catalog import files the item under an existing category by
  // this (matched after normalizeText, never created); the warehouse import
  // ignores it - a warehouse product's category is the catalog's.
  category: ['الفئة', 'فئة', 'التصنيف', 'تصنيف', 'الفئة الدوائية', 'المجموعة الدوائية', 'category', 'class'],
  unit: ['الوحدة', 'وحدة', 'الشكل', 'الشكل الصيدلاني', 'العبوة', 'unit', 'form', 'pack'],
  currency: ['العملة', 'عملة', 'currency', 'cur'],
  bonus: ['البونص', 'بونص', 'العرض', 'عرض', 'الهدية', 'bonus', 'free'],
};

const IMPORT_FIELDS = Object.keys(FIELD_SYNONYMS);

// A file is only readable once these are known. `manufacturer` can also come
// from the old template's company rows (a [bracketed] or yellow row above its
// medicines) - see productCatalog.service.js's parser. `name` is also met by
// an English name column alone (`nameEn`).
const REQUIRED_FIELDS = ['name', 'price', 'manufacturer'];

const CURRENCY_SYNONYMS = {
  SYP: ['ل.س', 'ل س', 'ليرة', 'ليرة سورية', 'سوري', 'SYP', 'SP', 'S.P', 'LS', 'ل.س.'],
  USD: ['$', 'دولار', 'USD', 'US', 'dollar', 'US$'],
};

const HEADER_TO_FIELD = new Map();
for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
  for (const synonym of synonyms) HEADER_TO_FIELD.set(normalizeText(synonym), field);
}

const CURRENCY_BY_TOKEN = new Map();
for (const [currency, synonyms] of Object.entries(CURRENCY_SYNONYMS)) {
  for (const synonym of synonyms) {
    const key = normalizeText(synonym);
    if (key) CURRENCY_BY_TOKEN.set(key, currency);
  }
}

// The field a header cell names, or null. Exact normalized match first; then a
// header that merely CONTAINS a synonym as whole words ("سعر المبيع بالدولار")
// takes the longest synonym it contains.
function fieldForHeader(text) {
  const key = normalizeText(text);
  if (!key) return null;
  if (HEADER_TO_FIELD.has(key)) return HEADER_TO_FIELD.get(key);
  let best = null;
  for (const [synonym, field] of HEADER_TO_FIELD) {
    if (synonym.length < 3) continue;
    const padded = ` ${key} `;
    if (padded.includes(` ${synonym} `) && (!best || synonym.length > best.synonym.length)) {
      best = { synonym, field };
    }
  }
  return best ? best.field : null;
}

// A currency cell's value -> 'SYP' | 'USD' | null (unrecognized) | '' (empty).
function currencyForText(text) {
  if (text === undefined || text === null) return '';
  const raw = String(text).trim();
  if (!raw) return '';
  if (raw.includes('$')) return 'USD';
  const key = normalizeText(raw);
  if (!key) return null;
  return CURRENCY_BY_TOKEN.get(key) ?? null;
}

module.exports = {
  FIELD_SYNONYMS,
  IMPORT_FIELDS,
  REQUIRED_FIELDS,
  CURRENCY_SYNONYMS,
  fieldForHeader,
  currencyForText,
  CURRENCY_BY_TOKEN,
};
