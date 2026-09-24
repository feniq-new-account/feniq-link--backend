// Names in one language only (pre-merge review). A catalog item needs an
// Arabic OR an English name; identityKey comes from the Arabic name, else
// "en:" + the English one; a single raw name is filed under the language it is
// written in (utils/nameLanguage.js). Nothing is skipped for lacking a name.
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Manufacturer = require('../src/models/manufacturer.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Product = require('../src/models/product.model');
const CatalogRequest = require('../src/models/catalogRequest.model');
const ImportBatchRow = require('../src/models/importBatchRow.model');
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const ExchangeRate = require('../src/models/exchangeRate.model');

const { isArabicName, splitNameByLanguage, namesByLanguage } = require('../src/utils/nameLanguage');
const catalogService = require('../src/services/productCatalog.service');
const catalogRequestService = require('../src/services/catalogRequest.service');
const importService = require('../src/services/warehouseImport.service');
const { importProductsFromExcel } = require('../src/services/warehouseProduct.service');
const { updateManufacturer } = require('../src/services/manufacturer.service');
const { listWarehouseProducts } = require('../src/services/product.service');
const orderService = require('../src/services/order.service');

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
  const phone = `09470${String(seq).padStart(5, '0')}`;
  const user = await User.create({ name: `WH${seq}`, phone, role: 'warehouse', status: 'active' });
  const warehouse = await Warehouse.create({
    userId: user._id, nameAr: `مستودع ${seq}`, nameEn: `Warehouse ${seq}`, address: 'r', city: 'Latakia',
    phone, deliveryType: 'self', isActive: true, discountRate: 0, commissionRate: 0,
  });
  return { userId: user._id, warehouseId: warehouse._id };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-one-language-test' });
  await syncIndexes(Manufacturer, ProductCatalog, Product, CatalogRequest, Order, OrderItem);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 100, source: 'manual', manualOverride: true });
  ids.admin = (await User.create({ name: 'AD', phone: '0952009901', role: 'admin', status: 'active' }))._id;
  ids.gsk = await Manufacturer.create({ nameAr: 'جي اس كي', nameEn: 'GSK' });
});

test.after(async () => {
  await stopMemoryMongo();
});

// --- language detection ---------------------------------------------------------

test('a name with Arabic letters is Arabic, anything else is English', () => {
  assert.strictEqual(isArabicName('بنادول 500'), true);
  assert.strictEqual(isArabicName('Panadol 500 بنادول'), true);
  assert.strictEqual(isArabicName('Panadol 500'), false);
  assert.strictEqual(isArabicName('500'), false);
  assert.deepStrictEqual(splitNameByLanguage(' Panadol 500 '), { nameAr: null, nameEn: 'Panadol 500' });
  assert.deepStrictEqual(splitNameByLanguage('بنادول'), { nameAr: 'بنادول', nameEn: null });
  assert.deepStrictEqual(splitNameByLanguage('  '), { nameAr: null, nameEn: null });
  assert.deepStrictEqual(namesByLanguage('Panadol', 'بنادول'), { nameAr: 'بنادول', nameEn: 'Panadol' });
});

// --- the model and the identity key ------------------------------------------------

test('a catalog item may have only an English name; with neither it is refused', async () => {
  const english = await ProductCatalog.create({ nameEn: 'Zyrtec 10mg', manufacturerAr: 'جي اس كي' });
  assert.strictEqual(english.nameAr, null);
  assert.strictEqual(english.identityKey, 'en:zyrtec 10mg|جي اس كي');

  const arabic = await ProductCatalog.create({ nameAr: 'زيرتك 10', nameEn: 'Zyrtec 10', manufacturerAr: 'جي اس كي' });
  // With an Arabic name, the identity is the Arabic one, as before.
  assert.strictEqual(arabic.identityKey, 'زيرتك 10|جي اس كي');

  await assert.rejects(ProductCatalog.create({ nameAr: '  ', nameEn: '', manufacturerAr: 'جي اس كي' }), (err) => err.name === 'ValidationError');
});

test('two English-only items with the same name under one manufacturer collide on the unique index', async () => {
  await ProductCatalog.create({ nameEn: 'Claritine', manufacturerAr: 'جي اس كي' });
  await assert.rejects(ProductCatalog.create({ nameEn: 'CLARITINE', manufacturerAr: 'جي إس كي' }), (err) => err.code === 11000);
  // An Arabic item whose Arabic text happens to be the same letters never collides with it.
  await ProductCatalog.create({ nameAr: 'كلاريتين', nameEn: 'Claritine', manufacturerAr: 'جي اس كي' });
});

test('a manufacturer rename keeps an English-only identity English', async () => {
  const m = await Manufacturer.create({ nameAr: 'شركة قبل', nameEn: 'Before Co' });
  const item = await ProductCatalog.create({ nameEn: 'Solo English', manufacturerAr: 'شركة قبل' });
  await updateManufacturer(m._id, { nameAr: 'شركة بعد' });
  const fresh = await ProductCatalog.findById(item._id).lean();
  assert.strictEqual(fresh.identityKey, 'en:solo english|شركه بعد');
});

test('the admin can rename either name, or clear one while the other remains', async () => {
  const item = await ProductCatalog.create({ nameAr: 'دواء للتعديل', nameEn: 'Editable Drug', manufacturerAr: 'جي اس كي' });
  let updated = await catalogService.updateCatalogItem(String(item._id), { nameAr: '' });
  assert.strictEqual(updated.nameAr, null);
  assert.strictEqual(updated.identityKey, 'en:editable drug|جي اس كي');
  updated = await catalogService.updateCatalogItem(String(item._id), { nameAr: 'دواء معدل' });
  assert.strictEqual(updated.nameAr, 'دواء معدل');
  assert.deepStrictEqual(
    updated.nameHistory.map((h) => [h.oldNameAr, h.newNameAr]),
    [['دواء للتعديل', null], [null, 'دواء معدل']]
  );
  await assert.rejects(
    catalogService.updateCatalogItem(String(item._id), { nameAr: '', nameEn: '' }),
    (err) => err.code === 'INVALID_PRODUCT_NAME'
  );
});

// --- import -> request -> approval ----------------------------------------------------

test('an English-only import row becomes a request with nameEn set and nameAr empty', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(warehouseId, userId, await xlsx([
    ['Item Name', 'Company', 'Price', 'Currency'],
    ['Brand New Syrup', 'GSK', 3, 'USD'],
  ]));
  const [row] = await ImportBatchRow.find({ batchId: report.batchId, bucket: 'review' }).lean();
  const request = await importService.requestCatalogItemFromRow(warehouseId, userId, report.batchId, row._id);
  const stored = await CatalogRequest.findById(request._id).lean();
  assert.strictEqual(stored.nameEn, 'Brand New Syrup');
  assert.strictEqual(stored.nameAr, null);
  // "GSK" resolved to the manufacturer by its English name.
  assert.strictEqual(String(stored.manufacturerId), String(ids.gsk._id));
  ids.englishRequest = stored._id;
});

test('an Arabic-only row still files its name as Arabic', async () => {
  const { userId, warehouseId } = await makeWarehouse();
  const report = await importProductsFromExcel(warehouseId, userId, await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
    ['شراب جديد كليا', 'جي اس كي', 3, 'USD'],
  ]));
  const [row] = await ImportBatchRow.find({ batchId: report.batchId, bucket: 'review' }).lean();
  const request = await importService.requestCatalogItemFromRow(warehouseId, userId, report.batchId, row._id);
  const stored = await CatalogRequest.findById(request._id).lean();
  assert.strictEqual(stored.nameAr, 'شراب جديد كليا');
  assert.strictEqual(stored.nameEn, null);
});

test('approving an English-only request: the admin may fill in the Arabic name', async () => {
  const approved = await catalogRequestService.approveRequest(String(ids.englishRequest), ids.admin, { nameAr: 'شراب جديد' });
  const item = await ProductCatalog.findById(approved.resolvedMasterProductId).lean();
  assert.strictEqual(item.nameEn, 'Brand New Syrup');
  assert.strictEqual(item.nameAr, 'شراب جديد');
  assert.ok(await Product.exists({ masterProductId: item._id }));
});

test('an English-only request is approved as an English-only item; a duplicate English name is a merge candidate', async () => {
  const { warehouseId } = await makeWarehouse();
  const request = await CatalogRequest.create({ warehouseId, nameEn: 'Only English Tabs', manufacturerAr: 'جي اس كي', manufacturerId: ids.gsk._id, priceUsd: 2 });
  const approved = await catalogRequestService.approveRequest(String(request._id), ids.admin, {});
  const item = await ProductCatalog.findById(approved.resolvedMasterProductId).lean();
  assert.strictEqual(item.nameAr, null);
  assert.strictEqual(item.identityKey, 'en:only english tabs|جي اس كي');

  // The catalog already has "Zyrtec 10" (with an Arabic name): an English request for it is a merge.
  const duplicate = await CatalogRequest.create({ warehouseId, nameEn: 'zyrtec  10', manufacturerAr: 'GSK', manufacturerId: ids.gsk._id, priceUsd: 2 });
  await assert.rejects(
    catalogRequestService.approveRequest(String(duplicate._id), ids.admin, {}),
    (err) => err.code === 'CATALOG_ITEM_ALREADY_EXISTS'
  );
});

test('admin import with one name column files each name by language; a later two-column file fills the missing name', async () => {
  const first = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'السعر', 'العملة'],
    ['Nurofen 400', 'جي اس كي', 2, 'USD'],
    ['بروفين 600', 'جي اس كي', 2, 'USD'],
  ]));
  assert.strictEqual(first.added, 2, JSON.stringify(first));
  const nurofen = await ProductCatalog.findOne({ nameEn: 'Nurofen 400' }).lean();
  assert.strictEqual(nurofen.nameAr, null);
  const brufen = await ProductCatalog.findOne({ nameAr: 'بروفين 600' }).lean();
  assert.strictEqual(brufen.nameEn, null);

  const second = await catalogService.importFromExcel(await xlsx([
    ['الاسم العربي', 'الاسم الانكليزي', 'الشركة', 'السعر', 'العملة'],
    ['نوروفين 400', 'Nurofen 400', 'جي اس كي', 3, 'USD'],
  ]));
  assert.strictEqual(second.added, 0, JSON.stringify(second));
  assert.strictEqual(second.updated, 1);
  const filled = await ProductCatalog.findById(nurofen._id).lean();
  assert.strictEqual(filled.nameAr, 'نوروفين 400');
  assert.strictEqual(filled.nameEn, 'Nurofen 400');
  // Now it has an Arabic name, its identity is the Arabic one.
  assert.strictEqual(filled.identityKey, 'نوروفين 400|جي اس كي');
});

// --- pharmacist catalog and orders ------------------------------------------------------

test('an English-only item is listed to the pharmacist, and can be ordered', async () => {
  const { warehouseId } = await makeWarehouse();
  const item = await ProductCatalog.findOne({ nameEn: 'Zyrtec 10mg' });
  const product = await Product.create({ warehouseId, masterProductId: item._id, price: 1.5, isActive: true, isAvailable: true });

  const { items } = await listWarehouseProducts(warehouseId, { limit: 20 });
  const listed = items.find((row) => String(row.product._id) === String(product._id));
  assert.ok(listed, 'the product is listed');
  assert.strictEqual(listed.product.nameEn, 'Zyrtec 10mg');
  assert.strictEqual(listed.product.nameAr, null);

  const phUser = await User.create({ name: 'Ph', phone: '0932009901', role: 'pharmacy', status: 'active' });
  const pharmacy = await Pharmacy.create({
    userId: phUser._id, nameAr: 'ص', nameEn: 'P', ownerName: 'O', address: 'a', city: 'Latakia',
    areaType: 'city', phone: '0932009901', addedBy: 'self',
  });
  const order = await orderService.createOrder({
    userId: phUser._id, pharmacyId: pharmacy._id, warehouseId,
    items: [{ productId: String(product._id), quantity: 2 }],
    notes: null, idempotencyKey: null, rateUsed: 100,
  });
  const line = await OrderItem.findOne({ orderId: order._id ?? order.order?._id }).lean();
  assert.strictEqual(line.productNameAr, null);
  assert.strictEqual(line.productNameEn, 'Zyrtec 10mg');
});

test('existing data: every item written with an Arabic name keeps its identity key', async () => {
  // The rule only changes items with no Arabic name, which could not exist
  // before this change (nameAr was required).
  const item = await ProductCatalog.create({ nameAr: 'باراسيتامول', manufacturerAr: 'جي اس كي' });
  assert.strictEqual(item.identityKey, 'باراسيتامول|جي اس كي');
  assert.strictEqual(await ProductCatalog.countDocuments({ nameAr: { $ne: null }, identityKey: /^en:/ }), 0);
});
