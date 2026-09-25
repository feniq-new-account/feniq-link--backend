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

// --- categories ------------------------------------------------------------------
// A category cell matches an existing category by its Arabic or English name
// after normalizeText. One that matches none is created - the text as written
// in the file - once per file, whatever spelling variants of it the file
// uses, and the items are filed under it. An empty cell is simply no category.

// The template test's example rows may already have created it (with the
// file's text as both names) - give it its English name, as an admin would.
function antibiotics() {
  return Category.findOneAndUpdate(
    { nameAr: 'صادات حيوية' },
    { $set: { nameEn: 'Antibiotics' } },
    { upsert: true, new: true }
  ).lean();
}

test('category: a spelling variant of an existing category matches it (Arabic or English name); nothing is created', async () => {
  const category = await antibiotics();
  const categoriesBefore = await Category.countDocuments();
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'الفئة'],
    ['دواء بفئة مكتوبة بالهاء', m, 'صادات حيويه'],
    ['دواء بفئة إنجليزية', m, ' ANTIBIOTICS '],
  ]));
  assert.strictEqual(report.added, 2, JSON.stringify(report));
  assert.deepStrictEqual(report.newCategories, []);
  assert.strictEqual(await Category.countDocuments(), categoriesBefore);
  for (const name of ['دواء بفئة مكتوبة بالهاء', 'دواء بفئة إنجليزية']) {
    assert.strictEqual(String((await itemNamed(name, m)).categoryId), String(category._id), name);
  }
});

function newCategoriesFile(m) {
  return xlsx([
    ['اسم المادة', 'الشركة', 'الفئة'],
    ['مكمل أول', m, 'مكملات غذائية'],
    ['مكمل ثان', m, ' مكملات غذائيه '], // ta marbuta written as ha, extra spaces
    ['مكمل ثالث', m, 'مكمّلات  غذائية'], // tashkeel and a double space
    ['فيتامين أول', m, 'Vitamins'],
    ['فيتامين ثان', m, 'VITAMINS'],
    ['دواء بلا فئة جديد', m, ''],
  ]);
}

test('category: a new one is created once per file, whatever spelling variants the file uses', async () => {
  const categoriesBefore = await Category.countDocuments();
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await newCategoriesFile(m));
  assert.strictEqual(report.added, 6, JSON.stringify(report));
  assert.deepStrictEqual(
    report.newCategories.map((c) => [c.nameAr, c.items]),
    [['مكملات غذائية', 3], ['Vitamins', 2]]
  );
  assert.strictEqual(await Category.countDocuments(), categoriesBefore + 2);

  // Created with the name as written in the file (both names until renamed).
  const supplements = await Category.findById(report.newCategories[0].id).lean();
  assert.strictEqual(supplements.nameAr, 'مكملات غذائية');
  assert.strictEqual(supplements.nameEn, 'مكملات غذائية');
  for (const name of ['مكمل أول', 'مكمل ثان', 'مكمل ثالث']) {
    assert.strictEqual(String((await itemNamed(name, m)).categoryId), String(supplements._id), name);
  }
  assert.strictEqual((await itemNamed('دواء بلا فئة جديد', m)).categoryId, null);
});

test('category: a re-import finds the categories it created instead of creating them again', async () => {
  const m = await manufacturer();
  await catalogService.importFromExcel(await newCategoriesFile(m));
  const categoriesBefore = await Category.countDocuments();

  const again = await catalogService.importFromExcel(await newCategoriesFile(m));
  assert.deepStrictEqual(again.newCategories, []);
  assert.strictEqual(again.unchanged, 6, JSON.stringify(again));
  assert.strictEqual(await Category.countDocuments(), categoriesBefore);
  // Nor does another file with another spelling of one of them.
  const other = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'الفئة'],
    ['مكمل رابع', m, 'مُكَمِّلات غذائيه'],
  ]));
  assert.deepStrictEqual(other.newCategories, []);
  assert.strictEqual(await Category.countDocuments(), categoriesBefore);
});

test('category: an empty cell imports the item without a category, with no warning', async () => {
  await antibiotics();
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'الفئة'],
    ['دواء بلا فئة', m, ''],
  ]));
  assert.strictEqual(report.added, 1, JSON.stringify(report));
  assert.strictEqual((await itemNamed('دواء بلا فئة', m)).categoryId, null);
  assert.deepStrictEqual(report.newCategories, []);
  assert.deepStrictEqual(report.errors, []);
});

test('category: a row skipped for an unconfirmed new manufacturer creates no category', async () => {
  const categoriesBefore = await Category.countDocuments();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'الفئة'],
    ['دواء شركة جديدة', 'شركة لم تُعتمد بعد', 'فئة لن تُنشأ'],
  ]));
  assert.strictEqual(report.newManufacturers.length, 1);
  assert.deepStrictEqual(report.newCategories, []);
  assert.strictEqual(await Category.countDocuments(), categoriesBefore);
});

test('category: a re-import files an existing item under its category, known or new; an empty cell leaves it as it was', async () => {
  const category = await antibiotics();
  const m = await manufacturer();
  await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة'],
    ['دواء يعاد استيراده', m],
  ]));
  const header = ['اسم المادة', 'الشركة', 'الفئة'];
  let report = await catalogService.importFromExcel(await xlsx([header, ['دواء يعاد استيراده', m, 'صادات حيوية']]));
  assert.strictEqual(report.updated, 1, JSON.stringify(report));
  assert.strictEqual(String((await itemNamed('دواء يعاد استيراده', m)).categoryId), String(category._id));

  report = await catalogService.importFromExcel(await xlsx([header, ['دواء يعاد استيراده', m, 'فئة جديدة للمنتج القائم']]));
  assert.strictEqual(report.updated, 1);
  assert.deepStrictEqual(report.newCategories.map((c) => [c.nameAr, c.items]), [['فئة جديدة للمنتج القائم', 1]]);
  const newCategoryId = String(report.newCategories[0].id);
  assert.strictEqual(String((await itemNamed('دواء يعاد استيراده', m)).categoryId), newCategoryId);

  report = await catalogService.importFromExcel(await xlsx([header, ['دواء يعاد استيراده', m, '']]));
  assert.strictEqual(report.unchanged, 1);
  assert.strictEqual(String((await itemNamed('دواء يعاد استيراده', m)).categoryId), newCategoryId);
});
