// Catalog overhaul Phase 12: the admin's catalog Excel import, against the
// same file shapes the warehouse import is tested with (import.warehouse.test.js)
// - title rows above the header, reordered columns, Arabic and English header
// synonyms, a remembered column mapping, Arabic digits and separators, SYP
// conversion, price 0, duplicate rows in one file, and withdrawn items.
//
// Bonus and unit are a warehouse's terms, not the catalog's: on this import a
// bad bonus or an unknown unit never blocks the row. Aliases are a warehouse
// import feature only (the catalog import creates the items aliases point at).
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const mongoose = require('mongoose');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const ImportColumnMapping = require('../src/models/importColumnMapping.model');
const catalogService = require('../src/services/productCatalog.service');

const RATE = 100; // 1 USD = 100 SYP

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
  await Manufacturer.create({ nameAr, key: require('../src/utils/normalizeText').normalizeText(nameAr) });
  return nameAr;
}

// A name is stored under the language it is written in (utils/nameLanguage.js).
const itemNamed = (name, manufacturerAr) =>
  ProductCatalog.findOne({ $or: [{ nameAr: name }, { nameEn: name }], manufacturerAr }).lean();

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-import-catalog-test' });
  await syncIndexes(ProductCatalog, Manufacturer, ImportColumnMapping);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: RATE, source: 'manual', manualOverride: true });
});

test.after(async () => {
  await stopMemoryMongo();
});

test('title rows above the header, reordered Arabic columns, Arabic digits and separators, SYP converted', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['القائمة المركزية للأدوية'],
    ['تحديث ٢٠٢٦/٩'],
    [],
    ['السعر', 'العملة', 'الشركة المصنعة', 'اسم المادة'],
    ['١٬٥٠٠', 'ل.س', m, 'اموكسيسيلين كتالوج ٥٠٠'],
    ['2.5', 'دولار', m, 'بنادول كتالوج'],
  ]));
  assert.strictEqual(report.added, 2, JSON.stringify(report));
  assert.deepStrictEqual(report.errors, []);
  assert.strictEqual(report.exchangeRateUsed, RATE);
  assert.strictEqual((await itemNamed('اموكسيسيلين كتالوج ٥٠٠', m)).priceUsd, 15); // 1500 SYP / 100
  assert.strictEqual((await itemNamed('بنادول كتالوج', m)).priceUsd, 2.5);
});

test('English header synonyms and the currency written in the price cell; no currency is a row error', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['Item Name', 'Manufacturer', 'Unit Price', 'Currency'],
    ['Panadol Catalog EN', m, '$3', ''],
    ['Voltaren Catalog EN', m, '12,000 S.P', ''],
    ['Amoxil Catalog EN', m, '4', ''],
  ]));
  assert.strictEqual(report.added, 2);
  assert.strictEqual(report.errors.length, 1);
  assert.strictEqual(report.errors[0].code, 'MISSING_CURRENCY');
  assert.strictEqual((await itemNamed('Voltaren Catalog EN', m)).priceUsd, 120);
  // A single name column: an English name is filed as nameEn, with no Arabic name.
  const voltaren = await itemNamed('Voltaren Catalog EN', m);
  assert.strictEqual(voltaren.nameEn, 'Voltaren Catalog EN');
  assert.strictEqual(voltaren.nameAr, null);
  assert.strictEqual(await itemNamed('Amoxil Catalog EN', m), null);
});

test('unrecognized headers ask for a mapping, which the next catalog import remembers', async () => {
  const m = await manufacturer();
  const rows = (price) => [
    ['الصنف المركزي', 'جهة الإنتاج', 'قيمة البيع', 'العملة'],
    ['دواء بخريطة أعمدة', m, price, 'USD'],
  ];
  let details;
  await assert.rejects(catalogService.importFromExcel(await xlsx(rows('5'))), (err) => {
    assert.strictEqual(err.code, 'IMPORT_COLUMNS_UNRECOGNIZED');
    details = err.details;
    return true;
  });
  const header = (text) => details.headers.find((h) => h.header === text).headerKey;
  const mapping = JSON.stringify({
    [header('الصنف المركزي')]: 'name',
    [header('جهة الإنتاج')]: 'manufacturer',
    [header('قيمة البيع')]: 'price',
  });

  const first = await catalogService.importFromExcel(await xlsx(rows('5')), { mapping });
  assert.strictEqual(first.added, 1);
  // Stored for the catalog import (no warehouse), not for any warehouse.
  assert.strictEqual(await ImportColumnMapping.countDocuments({ warehouseId: null }), 3);

  const again = await catalogService.importFromExcel(await xlsx(rows('6')));
  assert.strictEqual(again.updated, 1);
  assert.strictEqual((await itemNamed('دواء بخريطة أعمدة', m)).priceUsd, 6);
});

test("a warehouse's remembered mapping never applies to the catalog import", async () => {
  const m = await manufacturer();
  const warehouseId = new mongoose.Types.ObjectId();
  const file = () => xlsx([
    ['اسم المادة', 'الشركة المصنعة', 'رقم غريب للسعر', 'العملة'],
    ['دواء مخطط مستودع', m, '5', 'USD'],
  ]);
  const headerKey = require('../src/utils/normalizeText').normalizeText('رقم غريب للسعر');
  await ImportColumnMapping.create({ warehouseId, headerKey, field: 'price' });
  await assert.rejects(catalogService.importFromExcel(await file()), (err) => err.code === 'IMPORT_COLUMNS_UNRECOGNIZED');
});

test('a malformed mapping is a 400, not a guess', async () => {
  const file = await xlsx([['a', 'b'], ['x', 'y']]);
  await assert.rejects(catalogService.importFromExcel(file, { mapping: '{not json' }), (err) => err.code === 'INVALID_COLUMN_MAPPING');
  await assert.rejects(
    catalogService.importFromExcel(file, { mapping: JSON.stringify({ a: 'discount' }) }),
    (err) => err.code === 'INVALID_COLUMN_MAPPING'
  );
});

test('price 0 is accepted as a catalog price', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة', 'السعر', 'العملة'],
    ['دواء مجاني كتالوج', m, '0', 'USD'],
  ]));
  assert.strictEqual(report.added, 1, JSON.stringify(report));
  assert.strictEqual((await itemNamed('دواء مجاني كتالوج', m)).priceUsd, 0);
});

test('the same medicine twice in one file becomes one catalog item (the later row wins)', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة', 'السعر', 'العملة'],
    ['دواء مكرر كتالوج', m, '4', 'USD'],
    ['دواء  مكرّر كتالوج', m, '5', 'USD'], // spacing and tashkeel differ - same identity
  ]));
  assert.strictEqual(report.added, 1);
  assert.strictEqual(report.updated, 1);
  const items = await ProductCatalog.find({ manufacturerAr: m }).lean();
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].priceUsd, 5);
});

test('a bad bonus or an unknown unit does not block a catalog row', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة', 'السعر', 'العملة', 'البونص', 'الوحدة'],
    ['دواء ببونص غريب', m, '3', 'USD', 'كثير', 'دلو'],
  ]));
  assert.strictEqual(report.added, 1, JSON.stringify(report));
  assert.deepStrictEqual(report.errors, []);
});

test('rows without a name or a readable price are errors', async () => {
  const m = await manufacturer();
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة', 'السعر', 'العملة'],
    ['', m, '3', 'USD'],
    ['دواء بسعر غير مقروء', m, 'غالي', 'USD'],
    ['دواء سليم كتالوج', m, '3', 'USD'],
  ]));
  assert.strictEqual(report.added, 1);
  assert.strictEqual(report.errors.length, 2);
});

test('a withdrawn item is reported, never reactivated or repriced by a re-import', async () => {
  const m = await manufacturer();
  const withdrawn = await ProductCatalog.create({ nameAr: 'دواء مسحوب كتالوج', manufacturerAr: m, priceUsd: 2, isActive: false });
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة المصنعة', 'السعر', 'العملة'],
    ['دواء مسحوب كتالوج', m, '9', 'USD'],
  ]));
  assert.strictEqual(report.withdrawn.length, 1);
  const after = await ProductCatalog.findById(withdrawn._id).lean();
  assert.strictEqual(after.isActive, false);
  assert.strictEqual(after.priceUsd, 2);
});
