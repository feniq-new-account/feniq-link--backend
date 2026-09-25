// The admin's central catalog Excel import. It has its own columns
// (config/importSynonyms.js IMPORT_COLUMN_SETS.catalog): name and company
// required, category optional. The central catalog has no price - a price
// belongs to a warehouse's product - so price, currency, unit and bonus
// columns are ignored. Tested against the same file shapes as the warehouse
// import (import.warehouse.test.js): title rows above the header, reordered
// columns, Arabic and English header synonyms, a remembered column mapping,
// duplicate rows in one file, and withdrawn items. Aliases are a warehouse
// import feature only (the catalog import creates the items aliases point at).
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const mongoose = require('mongoose');
const Category = require('../src/models/category.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const ImportColumnMapping = require('../src/models/importColumnMapping.model');
const catalogService = require('../src/services/productCatalog.service');
const { importProductsFromExcel } = require('../src/services/warehouseProduct.service');
const { normalizeText } = require('../src/utils/normalizeText');

async function xlsx(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  rows.forEach((row) => sheet.addRow(row));
  return { buffer: await workbook.xlsx.writeBuffer(), originalname: 'catalog.xlsx' };
}

let seq = 0;
// A manufacturer name no other test uses, created up front so rows import
// without the new-manufacturer confirmation step.
async function manufacturer() {
  seq += 1;
  const nameAr = `مصنع الكتالوج ${seq}`;
  await Manufacturer.create({ nameAr, key: normalizeText(nameAr) });
  return nameAr;
}

const itemNamed = (nameAr, manufacturerAr) => ProductCatalog.findOne({ nameAr, manufacturerAr }).lean();

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-import-catalog-test' });
  await syncIndexes(ProductCatalog, Manufacturer, ImportColumnMapping);
  // Deliberately no exchange rate: the catalog import never needs one.
});

test.after(async () => {
  await stopMemoryMongo();
});

// --- the catalog's own columns ----------------------------------------------------

test('a file with only name, company and category imports with no mapping step', async () => {
  await Category.create({ nameAr: 'مسكنات', nameEn: 'Painkillers' });
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم الدواء', 'الشركة', 'الفئة'],
    ['باراسيتامول كتالوج', m, 'مسكنات'],
    ['إيبوبروفين كتالوج', m, ''],
  ]));
  assert.strictEqual(report.added, 2, JSON.stringify(report));
  assert.deepStrictEqual(report.errors, []);
  assert.ok(!('exchangeRateUsed' in report) && !('convertedFromSyp' in report));
  const paracetamol = await itemNamed('باراسيتامول كتالوج', m);
  assert.ok(paracetamol.categoryId);
  assert.ok(!('priceUsd' in paracetamol), 'the central catalog has no price');
});

test('a price column (and currency, unit, bonus) is ignored, whatever is in it', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة', 'السعر', 'العملة', 'الوحدة', 'البونص'],
    ['دواء بسعر مهمل', m, '13000', 'ل.س', 'علبة', '10+1'],
    ['دواء بسعر غير مقروء', m, 'غالي', '', 'دلو', 'كثير'], // would be errors in a warehouse file
  ]));
  assert.strictEqual(report.added, 2, JSON.stringify(report));
  assert.deepStrictEqual(report.errors, []);
  for (const name of ['دواء بسعر مهمل', 'دواء بسعر غير مقروء']) {
    assert.ok(!('priceUsd' in (await itemNamed(name, m))), name);
  }

  // A re-import with a price column changes nothing on the item.
  const again = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة', 'السعر', 'العملة'],
    ['دواء بسعر مهمل', m, '9', 'USD'],
  ]));
  assert.strictEqual(again.unchanged, 1, JSON.stringify(again));
  assert.ok(!('priceUsd' in (await itemNamed('دواء بسعر مهمل', m))));
});

test('the warehouse import still requires a price column', async () => {
  const warehouseId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  await assert.rejects(
    importProductsFromExcel(warehouseId, userId, await xlsx([
      ['اسم المادة', 'الشركة', 'الفئة'],
      ['دواء', 'شركة', 'مسكنات'],
    ])),
    (err) => {
      assert.strictEqual(err.code, 'IMPORT_COLUMNS_UNRECOGNIZED');
      assert.deepStrictEqual(err.details.missing, ['price']);
      assert.deepStrictEqual(err.details.required, ['name', 'price', 'manufacturer']);
      assert.deepStrictEqual(err.details.fields, ['name', 'price', 'manufacturer', 'unit', 'currency', 'bonus']);
      return true;
    }
  );
});

test('title rows above the header, reordered Arabic columns', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['القائمة المركزية للأدوية'],
    ['تحديث ٢٠٢٦/٩'],
    [],
    ['الشركة المصنعة', 'اسم المادة'],
    [m, 'اموكسيسيلين كتالوج ٥٠٠'],
    [m, 'بنادول كتالوج'],
  ]));
  assert.strictEqual(report.added, 2, JSON.stringify(report));
  assert.deepStrictEqual(report.errors, []);
  assert.ok(await itemNamed('اموكسيسيلين كتالوج ٥٠٠', m));
});

test('English header synonyms; the one name column is the Arabic name', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['Item Name', 'Manufacturer', 'Category'],
    ['Voltaren Catalog EN', m, ''],
  ]));
  assert.strictEqual(report.added, 1, JSON.stringify(report));
  // Whatever it is written in; the import never sets the English name (a
  // search helper only an admin sets).
  const voltaren = await itemNamed('Voltaren Catalog EN', m);
  assert.strictEqual(voltaren.nameAr, 'Voltaren Catalog EN');
  assert.strictEqual(voltaren.nameEn, null);
});

test('unrecognized headers ask for a mapping offering only the catalog fields; the next import remembers it', async () => {
  const m = await manufacturer();
  const rows = [
    ['الصنف المركزي', 'جهة الإنتاج', 'قيمة البيع'],
    ['دواء بخريطة أعمدة', m, '5'],
  ];
  let details;
  await assert.rejects(catalogService.importFromExcel(await xlsx(rows)), (err) => {
    assert.strictEqual(err.code, 'IMPORT_COLUMNS_UNRECOGNIZED');
    details = err.details;
    return true;
  });
  // The mapping dialog offers exactly these.
  assert.deepStrictEqual(details.fields, ['name', 'manufacturer', 'category']);
  assert.deepStrictEqual(details.required, ['name', 'manufacturer']);
  // 'الصنف المركزي' contains the name synonym 'الصنف'; the company is what is missing.
  assert.deepStrictEqual(details.missing, ['manufacturer']);
  const header = (text) => details.headers.find((h) => h.header === text).headerKey;

  // A price is not a catalog field, so mapping a column to it is refused.
  await assert.rejects(
    catalogService.importFromExcel(await xlsx(rows), { mapping: JSON.stringify({ [header('قيمة البيع')]: 'price' }) }),
    (err) => err.code === 'INVALID_COLUMN_MAPPING'
  );

  const mapping = JSON.stringify({ [header('الصنف المركزي')]: 'name', [header('جهة الإنتاج')]: 'manufacturer' });
  const first = await catalogService.importFromExcel(await xlsx(rows), { mapping });
  assert.strictEqual(first.added, 1);
  // Stored for the catalog import (no warehouse), not for any warehouse.
  assert.strictEqual(await ImportColumnMapping.countDocuments({ warehouseId: null }), 2);

  const again = await catalogService.importFromExcel(await xlsx(rows));
  assert.strictEqual(again.unchanged, 1, JSON.stringify(again));
});

test("a warehouse's remembered mapping never applies to the catalog import", async () => {
  const m = await manufacturer();
  const warehouseId = new mongoose.Types.ObjectId();
  const file = () => xlsx([
    ['اسم المادة', 'اسم المنتج من عند المستودع'],
    ['دواء مخطط مستودع', m],
  ]);
  await ImportColumnMapping.create({ warehouseId, headerKey: normalizeText('اسم المنتج من عند المستودع'), field: 'manufacturer' });
  await assert.rejects(catalogService.importFromExcel(await file()), (err) => {
    assert.strictEqual(err.code, 'IMPORT_COLUMNS_UNRECOGNIZED');
    assert.deepStrictEqual(err.details.missing, ['manufacturer']);
    return true;
  });
});

test('a remembered catalog mapping to a field the catalog does not read is ignored', async () => {
  const m = await manufacturer();
  // As saved while the catalog import still read prices.
  await ImportColumnMapping.create({ warehouseId: null, headerKey: normalizeText('سعر قديم محفوظ'), field: 'price' });
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'سعر قديم محفوظ'],
    ['دواء بخريطة قديمة', m, '7'],
  ]));
  assert.strictEqual(report.added, 1, JSON.stringify(report));
  assert.ok(!('priceUsd' in (await itemNamed('دواء بخريطة قديمة', m))));
});

test('a malformed mapping is a 400, not a guess', async () => {
  const file = await xlsx([['a', 'b'], ['x', 'y']]);
  await assert.rejects(catalogService.importFromExcel(file, { mapping: '{not json' }), (err) => err.code === 'INVALID_COLUMN_MAPPING');
  await assert.rejects(
    catalogService.importFromExcel(file, { mapping: JSON.stringify({ a: 'discount' }) }),
    (err) => err.code === 'INVALID_COLUMN_MAPPING'
  );
});

test('the same medicine twice in one file becomes one catalog item', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة'],
    ['دواء مكرر كتالوج', m],
    ['دواء  مكرّر كتالوج', m], // spacing and tashkeel differ - same identity
  ]));
  assert.strictEqual(report.added, 1);
  assert.strictEqual(report.unchanged, 1);
  const items = await ProductCatalog.find({ manufacturerAr: m }).lean();
  assert.strictEqual(items.length, 1);
});

test('rows without a name or a company are errors', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة'],
    ['', m],
    ['دواء بلا شركة', ''],
    ['دواء سليم كتالوج', m],
  ]));
  assert.strictEqual(report.added, 1);
  assert.deepStrictEqual(report.errors.map((e) => e.code), ['MISSING_NAME', 'MISSING_MANUFACTURER']);
});

test('a withdrawn item is reported, never reactivated by a re-import', async () => {
  const m = await manufacturer();
  const withdrawn = await ProductCatalog.create({ nameAr: 'دواء مسحوب كتالوج', manufacturerAr: m, isActive: false });
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة'],
    ['دواء مسحوب كتالوج', m],
  ]));
  assert.strictEqual(report.withdrawn.length, 1);
  assert.strictEqual((await ProductCatalog.findById(withdrawn._id).lean()).isActive, false);
});

test('the admin template has the catalog columns only - no price', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await catalogService.generateTemplateBuffer());
  const headers = workbook.worksheets[0].getRow(2).values.filter(Boolean);
  assert.deepStrictEqual(headers, ['اسم الدواء', 'الشركة', 'الفئة']);
  // And it imports as-is (its example rows), with no mapping step.
  const m = await manufacturer();
  const sheet = workbook.worksheets[0];
  for (let r = 3; r <= sheet.rowCount; r += 1) {
    if (sheet.getRow(r).getCell(2).value) sheet.getRow(r).getCell(2).value = m;
  }
  const report = await catalogService.importFromExcel({ buffer: await workbook.xlsx.writeBuffer(), originalname: 't.xlsx' });
  assert.strictEqual(report.added, 3, JSON.stringify(report));
});

// --- categories (pre-merge review) --------------------------------------------
// A category cell is matched against the existing categories' Arabic and
// English names after normalizeText. The import never creates a category: an
// unknown one leaves the item without a category and is listed in the report
// with the file's text; an empty cell is simply no category.

async function antibiotics() {
  return (
    (await Category.findOne({ nameEn: 'Antibiotics' }).lean()) ??
    (await Category.create({ nameAr: 'صادات حيوية', nameEn: 'Antibiotics' })).toObject()
  );
}

test('category: a spelling variant of an existing category matches it (Arabic or English name)', async () => {
  const category = await antibiotics();
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة', 'الفئة'],
    ['دواء بفئة مكتوبة بالهاء', m, '1', 'USD', 'صادات حيويه'],
    ['دواء بفئة إنجليزية', m, '1', 'USD', ' ANTIBIOTICS '],
  ]));
  assert.strictEqual(report.added, 2, JSON.stringify(report));
  assert.deepStrictEqual(report.unknownCategories, []);
  for (const name of ['دواء بفئة مكتوبة بالهاء', 'دواء بفئة إنجليزية']) {
    assert.strictEqual(String((await itemNamed(name, m)).categoryId), String(category._id), name);
  }
});

test('category: an unknown one imports the item without a category, lists the row, and creates nothing', async () => {
  await antibiotics();
  const categoriesBefore = await Category.countDocuments();
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة', 'التصنيف'],
    ['دواء بفئة مجهولة', m, '1', 'USD', 'فئة لا وجود لها'],
  ]));
  assert.strictEqual(report.added, 1, JSON.stringify(report));
  assert.strictEqual((await itemNamed('دواء بفئة مجهولة', m)).categoryId, null);
  assert.deepStrictEqual(report.unknownCategories, [{ row: 2, category: 'فئة لا وجود لها' }]);
  assert.deepStrictEqual(report.errors, []);
  assert.strictEqual(await Category.countDocuments(), categoriesBefore);
});

test('category: an empty cell imports the item without a category, with no warning', async () => {
  await antibiotics();
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة', 'الفئة'],
    ['دواء بلا فئة', m, '1', 'USD', ''],
  ]));
  assert.strictEqual(report.added, 1, JSON.stringify(report));
  assert.strictEqual((await itemNamed('دواء بلا فئة', m)).categoryId, null);
  assert.deepStrictEqual(report.unknownCategories, []);
  assert.deepStrictEqual(report.errors, []);
});

test('category: a re-import files an existing item under a known category; unknown or empty leaves it as it was', async () => {
  const category = await antibiotics();
  const m = await manufacturer();
  await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
    ['دواء يعاد استيراده', m, '1', 'USD'],
  ]));
  const header = ['اسم المادة', 'الشركة', 'السعر', 'العملة', 'الفئة'];
  let report = await catalogService.importFromExcel(await xlsx([header, ['دواء يعاد استيراده', m, '2', 'USD', 'صادات حيوية']]));
  assert.strictEqual(report.updated, 1, JSON.stringify(report));
  assert.strictEqual(String((await itemNamed('دواء يعاد استيراده', m)).categoryId), String(category._id));

  report = await catalogService.importFromExcel(await xlsx([header, ['دواء يعاد استيراده', m, '3', 'USD', 'فئة مجهولة']]));
  assert.deepStrictEqual(report.unknownCategories, [{ row: 2, category: 'فئة مجهولة' }]);
  report = await catalogService.importFromExcel(await xlsx([header, ['دواء يعاد استيراده', m, '4', 'USD', '']]));
  assert.deepStrictEqual(report.unknownCategories, []);
  assert.strictEqual(String((await itemNamed('دواء يعاد استيراده', m)).categoryId), String(category._id));
});
