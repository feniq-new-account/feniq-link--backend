// Catalog overhaul Phase 4 - the warehouse Excel import redesign, and the
// admin catalog import on the same reader.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-warehouse-import-tests-00000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const ImportBatch = require('../src/models/importBatch.model');
const ImportBatchRow = require('../src/models/importBatchRow.model');
const ImportColumnMapping = require('../src/models/importColumnMapping.model');
const WarehouseProductAlias = require('../src/models/warehouseProductAlias.model');
const CatalogRequest = require('../src/models/catalogRequest.model');

const catalogService = require('../src/services/productCatalog.service');
const importService = require('../src/services/warehouseImport.service');
const { importProductsFromExcel } = require('../src/services/warehouseProduct.service');

const RATE = 100; // 1 USD = 100 SYP

const expectCode = (code) => (err) => {
  assert.strictEqual(err.code, code);
  return true;
};

async function xlsx(rows, { sheets } = {}) {
  const workbook = new ExcelJS.Workbook();
  if (sheets) {
    for (const [name, sheetRows] of sheets) {
      const sheet = workbook.addWorksheet(name);
      sheetRows.forEach((row) => sheet.addRow(row));
    }
  } else {
    const sheet = workbook.addWorksheet('Sheet1');
    rows.forEach((row) => sheet.addRow(row));
  }
  return { buffer: await workbook.xlsx.writeBuffer(), originalname: 'prices.xlsx' };
}

let seq = 0;
async function makeWarehouse() {
  seq += 1;
  const phone = `09460${String(seq).padStart(5, '0')}`;
  const user = await User.create({ name: `WH${seq}`, phone, role: 'warehouse', status: 'active' });
  const warehouse = await Warehouse.create({
    userId: user._id,
    nameAr: `مستودع ${seq}`,
    nameEn: `Warehouse ${seq}`,
    address: 'r',
    city: 'Latakia',
    phone,
    isActive: true,
  });
  return { userId: user._id, warehouseId: warehouse._id };
}

async function rowsOf(batchId, bucket) {
  const filter = { batchId };
  if (bucket) filter.bucket = bucket;
  return ImportBatchRow.find(filter).sort({ rowNumber: 1 }).lean();
}

const ids = {};

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-warehouse-import-test' });
  await syncIndexes(Product, ProductCatalog, Manufacturer, WarehouseProductAlias, ImportColumnMapping);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: RATE, source: 'manual', manualOverride: true });
  ids.panadol = await ProductCatalog.create({ nameAr: 'بنادول اكسترا', nameEn: 'Panadol Extra', manufacturerAr: 'جي اس كي' });
  ids.amox = await ProductCatalog.create({ nameAr: 'أموكسيسيلين 500', manufacturerAr: 'ابن سينا' });
  ids.voltaren = await ProductCatalog.create({ nameAr: 'فولتارين 50', manufacturerAr: 'نوفارتس' });
});

test.after(async () => {
  await stopMemoryMongo();
});

test('title rows above the header, reordered columns, Arabic headers, Arabic digits and separators', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const file = await xlsx([
    ['مستودع الأمل للأدوية'],
    ['قائمة الأسعار ٢٠٢٦/٩'],
    [],
    ['السعر', 'العملة', 'الشركة المصنعة', 'اسم المادة', 'البونص', 'الوحدة'],
    ['١٬٥٠٠', 'ل.س', 'ابن سينا', 'اموكسيسيلين ٥٠٠', '10+1', 'علبة'],
    ['2.5', 'دولار', 'جي اس كي', 'بنادول  اكسترا', '', 'شريط'],
  ]);
  const report = await importProductsFromExcel(warehouseId, userId, file);
  assert.strictEqual(report.counts.added, 2);

  const amox = await Product.findOne({ warehouseId, masterProductId: ids.amox._id }).lean();
  assert.strictEqual(amox.price, 15); // 1500 SYP / 100
  assert.strictEqual(amox.unit, 'box');
  assert.deepStrictEqual(amox.bonuses.map((b) => [b.buy, b.free]), [[10, 1]]);
  const panadol = await Product.findOne({ warehouseId, masterProductId: ids.panadol._id }).lean();
  assert.strictEqual(panadol.price, 2.5);
  assert.strictEqual(panadol.unit, 'strip');

  const batch = await ImportBatch.findById(report.batchId).lean();
  assert.strictEqual(batch.exchangeRateUsed, RATE);
});

test('English headers, the currency written inside the price cell, and an empty currency is refused', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const file = await xlsx([
    ['Item Name', 'Manufacturer', 'Unit Price', 'Currency'],
    ['Panadol Extra', 'جي اس كي', '$3', ''],
    ['فولتارين 50', 'نوفارتس', '12,000 S.P', ''],
    ['أموكسيسيلين 500', 'ابن سينا', '4', ''],
  ]);
  const report = await importProductsFromExcel(warehouseId, userId, file);
  assert.strictEqual(report.counts.added, 2);
  const review = await rowsOf(report.batchId, 'review');
  assert.strictEqual(review.length, 1);
  assert.deepStrictEqual(review[0].reasons, ['missing_currency']);
  const voltaren = await Product.findOne({ warehouseId, masterProductId: ids.voltaren._id }).lean();
  assert.strictEqual(voltaren.price, 120);
});

test('unrecognized headers ask for a mapping, which is then remembered for the warehouse', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const rows = [
    ['الصنف التجاري', 'المنتج من', 'القيمة', 'العملة'],
    ['فولتارين 50', 'نوفارتس', '5', 'USD'],
  ];
  let details;
  await assert.rejects(importProductsFromExcel(warehouseId, userId, await xlsx(rows)), (err) => {
    assert.strictEqual(err.code, 'IMPORT_COLUMNS_UNRECOGNIZED');
    details = err.details;
    return true;
  });
  assert.deepStrictEqual(details.missing.sort(), ['manufacturer', 'price']);
  const header = (text) => details.headers.find((h) => h.header === text).headerKey;

  const mapping = JSON.stringify({ [header('المنتج من')]: 'manufacturer', [header('القيمة')]: 'price' });
  const first = await importProductsFromExcel(warehouseId, userId, await xlsx(rows), { mapping });
  assert.strictEqual(first.counts.added, 1);
  assert.strictEqual(await ImportColumnMapping.countDocuments({ warehouseId }), 2);

  // Next time, no mapping needed.
  const again = await importProductsFromExcel(warehouseId, userId, await xlsx([rows[0], ['فولتارين 50', 'نوفارتس', '6', 'USD']]));
  assert.strictEqual(again.counts.updated, 1);
});

test('price 0 creates the product disabled by the warehouse', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([['اسم المادة', 'الشركة', 'السعر', 'العملة'], ['فولتارين 50', 'نوفارتس', 0, 'USD']])
  );
  assert.strictEqual(report.counts.addedDisabled, 1);
  const product = await Product.findOne({ warehouseId, masterProductId: ids.voltaren._id }).lean();
  assert.strictEqual(product.manuallyDisabled, true);
  assert.strictEqual(product.isAvailable, false);
});

test('the same catalog item twice sends both rows to review; resolving keeps the chosen price', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([
      ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
      ['فولتارين 50', 'نوفارتس', 7, 'USD'],
      ['فولتارين  ٥٠', 'نوفارتس', 8, 'USD'],
    ])
  );
  const review = await rowsOf(report.batchId, 'review');
  assert.strictEqual(review.length, 2);
  assert.ok(review.every((r) => r.reasons.includes('duplicate_in_file')));
  assert.strictEqual(await Product.countDocuments({ warehouseId }), 0);

  await importService.resolveImportRow(warehouseId, userId, report.batchId, review[1]._id, {});
  const product = await Product.findOne({ warehouseId, masterProductId: ids.voltaren._id }).lean();
  assert.strictEqual(product.price, 8);
  assert.strictEqual((await rowsOf(report.batchId, 'resolved')).length, 2);
  const batch = await ImportBatch.findById(report.batchId).lean();
  assert.strictEqual(batch.counts.review, 0);
  assert.strictEqual(batch.counts.resolved, 2);
});

test('an unmatched row gets suggestions; resolving it saves an alias the next import uses', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const file = () =>
    xlsx([
      ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
      ['بانادول اكسترا', 'جي اس كي', 2, 'USD'],
    ]);
  const report = await importProductsFromExcel(warehouseId, userId, await file());
  const [row] = await rowsOf(report.batchId, 'review');
  assert.deepStrictEqual(row.reasons, ['not_matched']);
  assert.strictEqual(String(row.suggestions[0].masterProductId), String(ids.panadol._id));

  await importService.resolveImportRow(warehouseId, userId, report.batchId, row._id, {
    masterProductId: String(row.suggestions[0].masterProductId),
  });
  assert.strictEqual(await WarehouseProductAlias.countDocuments({ warehouseId }), 1);

  const second = await importProductsFromExcel(warehouseId, userId, await file());
  assert.strictEqual(second.counts.review, 0);
  assert.strictEqual(second.counts.updated, 1);
});

test('an unknown manufacturer goes to review; the row can become a catalog request (no product yet)', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([
      ['اسم المادة', 'الشركة', 'السعر', 'العملة', 'الوحدة', 'البونص'],
      ['دواء جديد تماما', 'شركة غير معروفة', 9, 'USD', 'حقنة', '5+1'],
    ])
  );
  const [row] = await rowsOf(report.batchId, 'review');
  assert.deepStrictEqual(row.reasons, ['unknown_manufacturer']);

  const request = await importService.requestCatalogItemFromRow(warehouseId, userId, report.batchId, row._id);
  const stored = await CatalogRequest.findById(request._id).lean();
  assert.strictEqual(stored.status, 'pending');
  assert.strictEqual(stored.priceUsd, 9);
  assert.strictEqual(stored.unit, 'injection');
  assert.deepStrictEqual(stored.bonuses.map((b) => [b.buy, b.free]), [[5, 1]]);
  assert.strictEqual(await Product.countDocuments({ warehouseId }), 0);
  assert.strictEqual((await ImportBatchRow.findById(row._id).lean()).bucket, 'resolved');
});

test('a bad bonus or an unknown unit sends the row to review - nothing is guessed', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([
      ['اسم المادة', 'الشركة', 'السعر', 'العملة', 'الوحدة', 'العرض'],
      ['فولتارين 50', 'نوفارتس', 5, 'USD', 'علبة', 'عشرة وواحد'],
      ['أموكسيسيلين 500', 'ابن سينا', 5, 'USD', 'كرتونة', ''],
    ])
  );
  const review = await rowsOf(report.batchId, 'review');
  assert.deepStrictEqual(review.map((r) => r.reasons), [['bad_bonus'], ['unknown_unit']]);
  assert.strictEqual(await Product.countDocuments({ warehouseId }), 0);

  // Fixing the bonus inline resolves the row.
  await importService.resolveImportRow(warehouseId, userId, report.batchId, review[0]._id, { bonus: '10+1' });
  const product = await Product.findOne({ warehouseId, masterProductId: ids.voltaren._id }).lean();
  assert.deepStrictEqual(product.bonuses.map((b) => [b.buy, b.free]), [[10, 1]]);
});

test('an empty bonus cell clears the bonus; a missing bonus column leaves it alone', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const header = ['اسم المادة', 'الشركة', 'السعر', 'العملة', 'البونص'];
  await importProductsFromExcel(warehouseId, userId, await xlsx([header, ['فولتارين 50', 'نوفارتس', 5, 'USD', '10+1']]));
  await importProductsFromExcel(warehouseId, userId, await xlsx([header.slice(0, 4), ['فولتارين 50', 'نوفارتس', 6, 'USD']]));
  let product = await Product.findOne({ warehouseId }).lean();
  assert.strictEqual(product.bonuses.length, 1);
  await importProductsFromExcel(warehouseId, userId, await xlsx([header, ['فولتارين 50', 'نوفارتس', 6, 'USD', '']]));
  product = await Product.findOne({ warehouseId }).lean();
  assert.strictEqual(product.bonuses.length, 0);
});

test('withdrawn and admin-disabled rows land in the blocked bucket', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const withdrawn = await ProductCatalog.create({ nameAr: 'مسحوب', manufacturerAr: 'ابن سينا', isActive: false });
  await Product.create({
    warehouseId,
    masterProductId: ids.amox._id,
    price: 1,
    isActive: false,
    deactivatedBy: 'admin',
  });
  const report = await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([
      ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
      ['مسحوب', 'ابن سينا', 5, 'USD'],
      ['أموكسيسيلين 500', 'ابن سينا', 5, 'USD'],
    ])
  );
  const blocked = await rowsOf(report.batchId, 'blocked');
  assert.deepStrictEqual(blocked.map((r) => r.blockedCode), ['CATALOG_ITEM_WITHDRAWN', 'PRODUCT_DISABLED_BY_ADMIN']);
  assert.strictEqual((await Product.findOne({ warehouseId, masterProductId: ids.amox._id }).lean()).price, 1);
  assert.ok(withdrawn);
});

test('the old company-row template still reads, from the first sheet that has a table', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx(null, {
      sheets: [
        ['Cover', [['ملف أسعار'], ['لا يوجد جدول هنا']]],
        ['Prices', [['note'], ['اسم الدواء (من القائمة)', 'السعر', 'العملة'], ['[نوفارتس]'], ['فولتارين 50', 3, 'USD']]],
      ],
    })
  );
  assert.strictEqual(report.counts.added, 1);
});

test('rows without a readable name or price are errors, never products', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([
      ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
      ['فولتارين 50', 'نوفارتس', 'غير معروف', 'USD'],
      ['', 'نوفارتس', 5, 'USD'],
      ['أموكسيسيلين 500', 'ابن سينا', '', 'USD'],
    ])
  );
  const errors = await rowsOf(report.batchId, 'error');
  assert.deepStrictEqual(errors.map((r) => r.reasons[0]), ['invalid_price', 'missing_name', 'missing_price']);
});

test('admin import: a new manufacturer is reported, then created on confirmation or linked to an existing one', async () => {
  const file = () =>
    xlsx([
      ['اسم الدواء', 'الشركة', 'السعر', 'العملة'],
      ['دواء الأدمن 1', 'شركة جديدة للأدمن', 3, 'USD'],
      ['دواء الأدمن 2', 'إبن  سينا', '', ''],
    ]);
  const first = await catalogService.importFromExcel(await file());
  assert.strictEqual(first.added, 1); // the إبن سينا spelling variant resolves to the existing manufacturer
  assert.deepStrictEqual(first.newManufacturers.map((m) => m.name), ['شركة جديدة للأدمن']);
  assert.strictEqual(await Manufacturer.countDocuments({ key: 'شركه جديده للادمن' }), 0);

  const confirmed = await catalogService.importFromExcel(await file(), {
    confirmNewManufacturers: ['شركة جديدة للأدمن'],
  });
  assert.strictEqual(confirmed.added, 1);
  assert.strictEqual(confirmed.newManufacturers.length, 0);
  assert.strictEqual(await Manufacturer.countDocuments({ key: 'شركه جديده للادمن' }), 1);

  const linkTarget = await Manufacturer.findOne({ key: 'نوفارتس' }).lean();
  const linked = await catalogService.importFromExcel(
    await xlsx([['اسم الدواء', 'الشركة', 'السعر', 'العملة'], ['دواء مربوط', 'Novartis AG', 1, 'USD']]),
    { manufacturerLinks: { 'Novartis AG': String(linkTarget._id) } }
  );
  assert.strictEqual(linked.added, 1);
  const item = await ProductCatalog.findOne({ nameAr: 'دواء مربوط' }).lean();
  assert.strictEqual(String(item.manufacturerId), String(linkTarget._id));
  assert.strictEqual(item.manufacturerAr, 'نوفارتس');
});

test('the live suggestion search finds a misspelled medicine', async () => {
  const suggestions = await importService.suggestCatalogItems({ name: 'اموكسيسلين 500', manufacturer: 'ابن سينا' });
  assert.strictEqual(String(suggestions[0].masterProductId), String(ids.amox._id));
  assert.ok(suggestions[0].score > 0.5);
});

// --- English names (pre-merge review) --------------------------------------
// Warehouses often write their price lists in English. A row's name (the one
// name column) matches a catalog item on its Arabic name or on its English
// name - a search helper the admin keeps - and its manufacturer resolves by
// the company's Arabic or English name.

async function englishCatalog() {
  if (ids.panadol500) return;
  const gsk = await Manufacturer.findOne({ key: 'جي اس كي' });
  gsk.nameEn = 'GSK';
  await gsk.save();
  ids.panadol500 = await ProductCatalog.create({ nameAr: 'بنادول 500', nameEn: 'Panadol 500', manufacturerAr: 'جي اس كي' });
  ids.augmentin = await ProductCatalog.create({ nameAr: 'اوجمنتين 1 غ', nameEn: 'Augmentin 1g', manufacturerAr: 'جي اس كي' });
}

test('English only: "Panadol 500" by "GSK" matches the Arabic catalog item', async () => {
  await englishCatalog();
  assert.strictEqual((await Manufacturer.findOne({ key: 'جي اس كي' }).lean()).enKey, 'gsk');
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(warehouseId, userId, await xlsx([
    ['Item Name', 'Company', 'Price', 'Currency'],
    ['Panadol 500', 'GSK', 2, 'USD'],
  ]));
  assert.strictEqual(report.counts.added, 1, JSON.stringify(report.counts));
  const product = await Product.findOne({ warehouseId, masterProductId: ids.panadol500._id }).lean();
  assert.strictEqual(product.price, 2);

  // Spelling, spacing and case variants of the same English text are the same item.
  const again = await importProductsFromExcel(warehouseId, userId, await xlsx([
    ['Item Name', 'Company', 'Price', 'Currency'],
    ['PANADOL  500', 'gsk', 3, 'USD'],
  ]));
  assert.strictEqual(again.counts.updated, 1, JSON.stringify(again.counts));
});

test('mixed: an Arabic name with an English manufacturer, and the other way round', async () => {
  await englishCatalog();
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(warehouseId, userId, await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
    ['بنادول 500', 'GSK', 2, 'USD'],
    ['Augmentin 1g', 'جي إس كي', 5, 'USD'],
  ]));
  assert.strictEqual(report.counts.added, 2, JSON.stringify(report.counts));
  assert.ok(await Product.exists({ warehouseId, masterProductId: ids.panadol500._id }));
  assert.ok(await Product.exists({ warehouseId, masterProductId: ids.augmentin._id }));
});

test('an English typo gets the right item in the top-5 suggestions, shown by its Arabic name', async () => {
  await englishCatalog();
  const suggestions = await importService.suggestCatalogItems({ name: 'Panadoll 500', manufacturer: 'GSK' });
  const top = suggestions.slice(0, 5).map((s) => String(s.masterProductId));
  assert.ok(top.includes(String(ids.panadol500._id)), JSON.stringify(suggestions));
  const hit = suggestions.find((s) => String(s.masterProductId) === String(ids.panadol500._id));
  assert.strictEqual(hit.nameAr, 'بنادول 500');
  assert.ok(!('nameEn' in hit), 'the English name is a matching helper, never returned for display');

  // A misspelled English manufacturer still earns the manufacturer bonus.
  const loose = await importService.suggestCatalogItems({ name: 'Augmentn 1g', manufacturer: 'GSKK' });
  assert.strictEqual(String(loose[0].masterProductId), String(ids.augmentin._id), JSON.stringify(loose));
});

test('an English manufacturer name shared by two companies resolves to neither', async () => {
  await englishCatalog();
  await Manufacturer.create([
    { nameAr: 'فايزر الأولى', nameEn: 'Pfizer' },
    { nameAr: 'فايزر الثانية', nameEn: 'pfizer' },
  ]);
  await ProductCatalog.create({ nameAr: 'دواء فايزر', nameEn: 'Pfizer Drug', manufacturerAr: 'فايزر الأولى' });
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(warehouseId, userId, await xlsx([
    ['Item Name', 'Company', 'Price', 'Currency'],
    ['Pfizer Drug', 'Pfizer', 2, 'USD'],
  ]));
  const [row] = await rowsOf(report.batchId, 'review');
  assert.deepStrictEqual(row.reasons, ['unknown_manufacturer']);
});

// ---------------------------------------------------------------------------
// Production and expiry dates in the warehouse file
// ---------------------------------------------------------------------------

const HEADERS_WITH_DATES = ['اسم المادة', 'الشركة', 'السعر', 'العملة', 'تاريخ الإنتاج', 'تاريخ الانتهاء'];
const ymd = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

test('production and expiry dates are read in any shape and saved on the products', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const file = await xlsx([
    HEADERS_WITH_DATES,
    ['بنادول اكسترا', 'جي اس كي', 1000, 'SYP', '2025-03-01', '15/3/2027'],
    ['أموكسيسيلين 500', 'ابن سينا', 2000, 'SYP', '', '03/2027'],
    ['فولتارين 50', 'نوفارتس', 3000, 'SYP', new Date(Date.UTC(2025, 5, 10)), '١٠/١١/٢٠٢٨'],
  ]);
  const report = await importProductsFromExcel(warehouseId, userId, file);
  assert.strictEqual(report.counts.added, 3);

  const products = await Product.find({ warehouseId }).lean();
  const byName = (nameAr) => products.find((p) => p.masterProductId.equals(ids[nameAr]._id));
  assert.strictEqual(ymd(byName('panadol').productionDate), '2025-03-01');
  assert.strictEqual(ymd(byName('panadol').expiryDate), '2027-03-15');
  assert.strictEqual(ymd(byName('amox').productionDate), null);
  assert.strictEqual(ymd(byName('amox').expiryDate), '2027-03-31');
  assert.strictEqual(ymd(byName('voltaren').productionDate), '2025-06-10');
  assert.strictEqual(ymd(byName('voltaren').expiryDate), '2028-11-10');
});

test('English and shortened date headers are recognised too', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const file = await xlsx([
    ['Product Name', 'Company', 'Price', 'Currency', 'MFG', 'EXP'],
    ['بنادول اكسترا', 'جي اس كي', 1000, 'SYP', '2025-01-02', 'Mar-27'],
  ]);
  const report = await importProductsFromExcel(warehouseId, userId, file);
  assert.strictEqual(report.counts.added, 1);
  const product = await Product.findOne({ warehouseId }).lean();
  assert.strictEqual(ymd(product.productionDate), '2025-01-02');
  assert.strictEqual(ymd(product.expiryDate), '2027-03-31');
});

test('an empty date cell leaves the product\'s dates alone when the file is imported again', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([HEADERS_WITH_DATES, ['بنادول اكسترا', 'جي اس كي', 1000, 'SYP', '2025-03-01', '2027-03-01']])
  );
  await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([HEADERS_WITH_DATES, ['بنادول اكسترا', 'جي اس كي', 1200, 'SYP', '', '']])
  );
  const product = await Product.findOne({ warehouseId }).lean();
  assert.strictEqual(ymd(product.productionDate), '2025-03-01');
  assert.strictEqual(ymd(product.expiryDate), '2027-03-01');
  // A new date in the file replaces it.
  await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([HEADERS_WITH_DATES, ['بنادول اكسترا', 'جي اس كي', 1200, 'SYP', '', '2028-01-31']])
  );
  const again = await Product.findOne({ warehouseId }).lean();
  assert.strictEqual(ymd(again.expiryDate), '2028-01-31');
});

test('a date that cannot be read holds the row for review, and can be fixed there', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const file = await xlsx([
    HEADERS_WITH_DATES,
    ['بنادول اكسترا', 'جي اس كي', 1000, 'SYP', '2025-03-01', 'قريباً'],
    ['أموكسيسيلين 500', 'ابن سينا', 2000, 'SYP', '2027-01-01', '2026-01-01'], // expires before it was made
  ]);
  const report = await importProductsFromExcel(warehouseId, userId, file);
  assert.strictEqual(report.counts.review, 2);
  const review = await rowsOf(report.batchId, 'review');
  assert.deepStrictEqual(review[0].reasons, ['bad_date']);
  assert.deepStrictEqual(review[1].reasons, ['bad_date']);
  assert.strictEqual(await Product.countDocuments({ warehouseId }), 0);

  await importService.resolveImportRow(warehouseId, userId, report.batchId, review[0]._id, {
    masterProductId: ids.panadol._id,
    expiryDate: '31/12/2027',
  });
  const product = await Product.findOne({ warehouseId }).lean();
  assert.strictEqual(ymd(product.productionDate), '2025-03-01');
  assert.strictEqual(ymd(product.expiryDate), '2027-12-31');

  // Still unreadable when typed in: refused.
  await assert.rejects(
    importService.resolveImportRow(warehouseId, userId, report.batchId, review[1]._id, {
      masterProductId: ids.amox._id,
      expiryDate: 'soon',
    }),
    expectCode('INVALID_DATE')
  );
});

test('a file without date columns still imports as before', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(
    warehouseId,
    userId,
    await xlsx([['اسم المادة', 'الشركة', 'السعر', 'العملة'], ['بنادول اكسترا', 'جي اس كي', 1000, 'SYP']])
  );
  assert.strictEqual(report.counts.added, 1);
  const product = await Product.findOne({ warehouseId }).lean();
  assert.strictEqual(product.expiryDate, null);
});

test('the warehouse template has the two date columns and reads back', async () => {
  const buffer = await catalogService.generateWarehouseTemplateBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const header = workbook.worksheets[0].getRow(2).values.slice(1);
  assert.ok(header.includes('تاريخ الإنتاج'));
  assert.ok(header.includes('تاريخ الانتهاء'));
  // The examples in the template read through the same importer.
  const { rows } = await catalogService.readImportWorkbook(
    { buffer, originalname: 'my-products-template.xlsx' },
    { columnSet: require('../src/config/importSynonyms').IMPORT_COLUMN_SETS.warehouse }
  );
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows.map((r) => ymd(r.expiryDate)), ['2027-03-01', '2027-06-15', '2027-12-31']);
  assert.deepStrictEqual(rows.map((r) => ymd(r.productionDate)), ['2025-03-01', '2025-06-15', null]);
  assert.ok(rows.every((r) => r.problems.length === 0));
});
