// Product names (pre-merge review): the Arabic name is the medicine's name -
// required, and the only one shown. The English name is optional and never
// shown: a helper that search and the warehouse import match on (nameEnKey),
// set by an admin. identityKey is nameKey|manufacturerKey.
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Manufacturer = require('../src/models/manufacturer.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Product = require('../src/models/product.model');
const CatalogRequest = require('../src/models/catalogRequest.model');
const ImportBatchRow = require('../src/models/importBatchRow.model');
const ExchangeRate = require('../src/models/exchangeRate.model');

const catalogService = require('../src/services/productCatalog.service');
const catalogRequestService = require('../src/services/catalogRequest.service');
const importService = require('../src/services/warehouseImport.service');
const warehouseProductService = require('../src/services/warehouseProduct.service');
const adminProductService = require('../src/services/adminProduct.service');
const { listWarehouseProducts } = require('../src/services/product.service');

const ids = {};
let seq = 0;

async function xlsx(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  rows.forEach((row) => sheet.addRow(row));
  return { buffer: await workbook.xlsx.writeBuffer(), originalname: 'prices.xlsx' };
}

async function makeWarehouse() {
  seq += 1;
  const phone = `09480${String(seq).padStart(5, '0')}`;
  const user = await User.create({ name: `WH${seq}`, phone, role: 'warehouse', status: 'active' });
  const warehouse = await Warehouse.create({
    userId: user._id, nameAr: `مستودع ${seq}`, nameEn: `Warehouse ${seq}`, address: 'r', city: 'Latakia',
    phone, deliveryType: 'self', isActive: true,
  });
  return { userId: user._id, warehouseId: warehouse._id };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-arabic-names-test' });
  await syncIndexes(Manufacturer, ProductCatalog, Product, CatalogRequest);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 100, source: 'manual', manualOverride: true });
  ids.admin = (await User.create({ name: 'AD', phone: '0952009911', role: 'admin', status: 'active' }))._id;
  ids.company = await Manufacturer.create({ nameAr: 'شركة الأسماء' });
  ids.panadol = await ProductCatalog.create({ nameAr: 'بنادول 500', nameEn: 'Panadol 500', manufacturerAr: 'شركة الأسماء' });
});

test.after(async () => {
  await stopMemoryMongo();
});

// --- the model ------------------------------------------------------------------

test('the Arabic name is required; the identity key is built from it alone', async () => {
  await assert.rejects(
    ProductCatalog.create({ nameEn: 'English Only', manufacturerAr: 'شركة الأسماء' }),
    (err) => err.name === 'ValidationError' && Boolean(err.errors.nameAr)
  );
  await assert.rejects(ProductCatalog.create({ nameAr: '   ', manufacturerAr: 'شركة الأسماء' }), (err) => err.name === 'ValidationError');
  assert.strictEqual(ids.panadol.identityKey, 'بنادول 500|شركه الاسماء');
  // The English name never enters the identity: a second item with another
  // Arabic name but the same English name is a different item.
  const other = await ProductCatalog.create({ nameAr: 'بانادول خمسمية', nameEn: 'Panadol 500', manufacturerAr: 'شركة الأسماء' });
  assert.strictEqual(other.identityKey, 'بانادول خمسميه|شركه الاسماء');
  await ProductCatalog.deleteOne({ _id: other._id });
});

test('admin edit: the English name (for search) can be set and cleared; the Arabic one cannot be cleared', async () => {
  const item = await ProductCatalog.create({ nameAr: 'دواء للتعديل', manufacturerAr: 'شركة الأسماء' });
  const { warehouseId } = await makeWarehouse();
  await Product.create({ warehouseId, masterProductId: item._id, price: 1, isActive: true });

  // Only the English name: nothing on any screen changes, so no rename
  // confirmation even with a linked product.
  let updated = await catalogService.updateCatalogItem(String(item._id), { nameEn: 'Editable Drug' });
  assert.strictEqual(updated.nameEn, 'Editable Drug');
  assert.strictEqual(updated.nameEnKey, 'editable drug');
  assert.strictEqual((await Product.findOne({ masterProductId: item._id }).lean()).nameEnKey, 'editable drug');
  updated = await catalogService.updateCatalogItem(String(item._id), { nameEn: '' });
  assert.strictEqual(updated.nameEn, null);
  assert.deepStrictEqual(
    updated.nameHistory.map((h) => [h.oldNameAr, h.newNameAr, h.oldNameEn, h.newNameEn]),
    [
      ['دواء للتعديل', 'دواء للتعديل', null, 'Editable Drug'],
      ['دواء للتعديل', 'دواء للتعديل', 'Editable Drug', null],
    ]
  );

  await assert.rejects(catalogService.updateCatalogItem(String(item._id), { nameAr: ' ' }), (err) => err.code === 'INVALID_PRODUCT_NAME');
  // Renaming the Arabic name still asks first when products are linked.
  await assert.rejects(
    catalogService.updateCatalogItem(String(item._id), { nameAr: 'دواء معدل' }),
    (err) => err.code === 'CATALOG_RENAME_NEEDS_CONFIRMATION'
  );
});

// --- search on the English name ---------------------------------------------------

test('a search for the English name finds the Arabic-named item - pharmacist, warehouse and admin', async () => {
  const { warehouseId } = await makeWarehouse();
  const product = await Product.create({ warehouseId, masterProductId: ids.panadol._id, price: 2, isActive: true, isAvailable: true });
  const found = (rows) => rows.map((row) => String((row.product ?? row)._id));

  const pharmacist = await listWarehouseProducts(warehouseId, { search: 'panadol', limit: 20 });
  assert.deepStrictEqual(found(pharmacist.items), [String(product._id)]);
  // What the pharmacist sees is the Arabic name.
  assert.strictEqual(pharmacist.items[0].product.nameAr, 'بنادول 500');

  const warehouse = await warehouseProductService.searchPaginatedProductsForWarehouse(warehouseId, { q: 'PANADOL 500', limit: 20 });
  assert.deepStrictEqual(found(warehouse.rows), [String(product._id)]);

  const admin = await adminProductService.listPaginatedAllProducts({ search: 'panadol', limit: 30 });
  assert.ok(found(admin.rows.map((row) => row.product)).includes(String(product._id)));

  const catalog = await catalogService.listCatalog({ search: 'panadol', limit: 30 });
  assert.ok(catalog.items.some((item) => String(item._id) === String(ids.panadol._id)));
  const pickerSearch = await catalogService.searchActiveForWarehouse('panadol');
  assert.ok(pickerSearch.some((item) => String(item._id) === String(ids.panadol._id)));
});

// --- the warehouse import ---------------------------------------------------------

test('a warehouse row "Panadol 500" matches the item "بنادول 500" whose English name is "Panadol 500"', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await warehouseProductService.importProductsFromExcel(warehouseId, userId, await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
    ['Panadol 500', 'شركة الأسماء', 2, 'USD'],
  ]));
  assert.strictEqual(report.counts.added, 1, JSON.stringify(report.counts));
  assert.ok(await Product.exists({ warehouseId, masterProductId: ids.panadol._id }));
});

// --- catalog requests ----------------------------------------------------------------

async function requestFromRow(name) {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await warehouseProductService.importProductsFromExcel(warehouseId, userId, await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
    [name, 'شركة الأسماء', 3, 'USD'],
  ]));
  const [row] = await ImportBatchRow.find({ batchId: report.batchId, bucket: 'review' }).lean();
  const request = await importService.requestCatalogItemFromRow(warehouseId, userId, report.batchId, row._id);
  return { request, userId, warehouseId };
}

test('a request raised from "Metformin 850" keeps the name as written, and needs an Arabic name to be approved', async () => {
  const { request, userId, warehouseId } = await requestFromRow('Metformin 850');
  const stored = await CatalogRequest.findById(request._id).lean();
  assert.strictEqual(stored.nameAr, 'Metformin 850');
  assert.ok(!('nameEn' in stored));

  // As raised, and with the panel's prefilled (unchanged) text: refused.
  for (const changes of [{}, { nameAr: 'Metformin 850' }]) {
    await assert.rejects(catalogRequestService.approveRequest(String(request._id), ids.admin, changes), (err) => {
      assert.strictEqual(err.code, 'ARABIC_NAME_REQUIRED');
      assert.strictEqual(err.details.requestName, 'Metformin 850');
      return true;
    });
  }
  assert.strictEqual((await CatalogRequest.findById(request._id).lean()).status, 'pending');

  // With an Arabic name (and the English one as the search helper): approved.
  const approved = await catalogRequestService.approveRequest(String(request._id), ids.admin, {
    nameAr: 'ميتفورمين 850',
    nameEn: 'Metformin 850',
  });
  const item = await ProductCatalog.findById(approved.resolvedMasterProductId).lean();
  assert.strictEqual(item.nameAr, 'ميتفورمين 850');
  assert.strictEqual(item.nameEn, 'Metformin 850');
  assert.strictEqual(item.identityKey, 'ميتفورمين 850|شركه الاسماء');

  // The warehouse's own text is remembered: its next file matches directly.
  const again = await warehouseProductService.importProductsFromExcel(warehouseId, userId, await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
    ['Metformin 850', 'شركة الأسماء', 4, 'USD'],
  ]));
  assert.strictEqual(again.counts.updated, 1, JSON.stringify(again.counts));
});

test('a request raised in Arabic is approved as written; the English name stays optional', async () => {
  const { request } = await requestFromRow('شراب جديد للاختبار');
  const approved = await catalogRequestService.approveRequest(String(request._id), ids.admin, {});
  const item = await ProductCatalog.findById(approved.resolvedMasterProductId).lean();
  assert.strictEqual(item.nameAr, 'شراب جديد للاختبار');
  assert.strictEqual(item.nameEn, null);
});

test('approval: an English name already used under the manufacturer is a merge candidate', async () => {
  const { request } = await requestFromRow('Panadol Five Hundred');
  await assert.rejects(
    catalogRequestService.approveRequest(String(request._id), ids.admin, { nameAr: 'بنادول جديد', nameEn: 'panadol  500' }),
    (err) => err.code === 'CATALOG_ITEM_ALREADY_EXISTS' && String(err.details.masterProductId) === String(ids.panadol._id)
  );
});

// --- the admin catalog import -----------------------------------------------------------

test('admin import: the one name column goes to the Arabic name and never touches the English name', async () => {
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة'],
    ['بنادول 500', 'شركة الأسماء'],
  ]));
  assert.strictEqual(report.unchanged, 1, JSON.stringify(report));
  const item = await ProductCatalog.findById(ids.panadol._id).lean();
  assert.strictEqual(item.nameAr, 'بنادول 500');
  assert.strictEqual(item.nameEn, 'Panadol 500');
});
