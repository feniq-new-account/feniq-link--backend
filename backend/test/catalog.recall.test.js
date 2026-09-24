// Catalog overhaul Phase 3 - recall, reactivation, re-enable (H3, M1, M5).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-catalog-recall-tests-000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Offer = require('../src/models/offer.model');
const Advertisement = require('../src/models/advertisement.model');

const catalogService = require('../src/services/productCatalog.service');
const warehouseProductService = require('../src/services/warehouseProduct.service');
const adminProductService = require('../src/services/adminProduct.service');
const warehouseOfferService = require('../src/services/warehouseOffer.service');
const adminOfferService = require('../src/services/adminOffer.service');

const expectCode = (code) => (err) => {
  assert.strictEqual(err.code, code);
  return true;
};

const ids = {};
let seq = 0;

async function makeWarehouse() {
  seq += 1;
  const phone = `09450${String(seq).padStart(5, '0')}`;
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
  return { user, warehouse };
}

function productFields(extra = {}) {
  return { price: 5, isActive: true, isAvailable: true, manuallyDisabled: false, ...extra };
}

async function packageWith(warehouseId, productIds) {
  const now = Date.now();
  return Advertisement.create({
    warehouseId,
    titleAr: 'باقة',
    titleEn: 'Package',
    items: productIds.map((productId) => ({ productId, quantity: 2 })),
    totalPriceUsd: 10,
    startDate: new Date(now - 86400000),
    endDate: new Date(now + 86400000),
    status: 'approved',
  });
}

async function offerOn(warehouseId, productId, status) {
  return Offer.create({
    warehouseId,
    productId,
    titleAr: 'عرض',
    titleEn: 'Offer',
    discountPercentage: 10,
    startDate: new Date(Date.now() - 86400000),
    endDate: new Date(Date.now() + 86400000),
    status,
  });
}

// A one-company workbook in the import template's shape.
async function workbookBuffer(manufacturerAr, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catalog');
  sheet.addRow(['note']);
  sheet.addRow(['اسم الدواء', 'السعر', 'العملة']);
  sheet.addRow([`[${manufacturerAr}]`]);
  for (const row of rows) sheet.addRow(row);
  return { buffer: await workbook.xlsx.writeBuffer() };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-recall-test' });
  await syncIndexes(Product, ProductCatalog, Offer, Advertisement);
  const category = await Category.create({ nameAr: 'فئة', nameEn: 'Category' });
  ids.category = String(category._id);
});

test.after(async () => {
  await stopMemoryMongo();
});

test('a recall disables linked products, stops their offers, and takes them out of packages', async () => {
  const { warehouse: w1 } = await makeWarehouse();
  const { warehouse: w2 } = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'دواء مسحوب', manufacturerAr: 'شركة' });
  const other = await ProductCatalog.create({ nameAr: 'دواء آخر', manufacturerAr: 'شركة' });

  const live = await Product.create({ warehouseId: w1._id, masterProductId: item._id, ...productFields() });
  const selfDisabled = await Product.create({
    warehouseId: w2._id,
    masterProductId: item._id,
    ...productFields({ manuallyDisabled: true, isAvailable: false }),
  });
  const otherProduct = await Product.create({ warehouseId: w1._id, masterProductId: other._id, ...productFields() });

  const approved = await offerOn(w1._id, live._id, 'approved');
  const pending = await offerOn(w2._id, selfDisabled._id, 'pending');
  const mixedPackage = await packageWith(w1._id, [live._id, otherProduct._id]);
  const onlyPackage = await packageWith(w1._id, [live._id]);

  const result = await catalogService.deactivateCatalogItem(item._id);
  assert.strictEqual(result.deactivatedProductCount, 2);
  assert.strictEqual(result.stoppedOfferCount, 2);
  assert.strictEqual(result.affectedPackageCount, 2);
  assert.strictEqual(result.emptiedPackageCount, 1);

  for (const id of [live._id, selfDisabled._id]) {
    const product = await Product.findById(id).lean();
    assert.strictEqual(product.isActive, false);
    assert.strictEqual(product.deactivatedBy, 'catalog_recall');
  }
  for (const id of [approved._id, pending._id]) {
    const offer = await Offer.findById(id).lean();
    assert.strictEqual(offer.status, 'stopped');
    assert.strictEqual(offer.stoppedReason, 'catalog_recall');
  }
  const mixed = await Advertisement.findById(mixedPackage._id).lean();
  assert.deepStrictEqual(mixed.items.map((i) => String(i.productId)), [String(otherProduct._id)]);
  assert.notStrictEqual(mixed.isAvailable, false);
  const emptied = await Advertisement.findById(onlyPackage._id).lean();
  assert.strictEqual(emptied.items.length, 0);
  assert.strictEqual(emptied.isAvailable, false);

  ids.recalled = { item, live, selfDisabled, approved, onlyPackage, w1, w2 };
});

test('reactivating brings back only the recalled products; warehouse- and admin-disabled stay off', async () => {
  const { item, live, selfDisabled, approved, onlyPackage, w1 } = ids.recalled;
  // An admin disables one more product individually while the item is withdrawn.
  const adminDisabled = await Product.create({
    warehouseId: (await makeWarehouse()).warehouse._id,
    masterProductId: item._id,
    ...productFields({ isActive: false, deactivatedBy: 'admin' }),
  });

  const updated = await catalogService.updateCatalogItem(item._id, { isActive: true });
  assert.strictEqual(updated.restoredProductCount, 2);

  const back = await Product.findById(live._id).lean();
  assert.strictEqual(back.isActive, true);
  assert.strictEqual(back.deactivatedBy, null);
  const stillSelfDisabled = await Product.findById(selfDisabled._id).lean();
  assert.strictEqual(stillSelfDisabled.isActive, true);
  assert.strictEqual(stillSelfDisabled.manuallyDisabled, true);
  assert.strictEqual(stillSelfDisabled.isAvailable, false);
  const stillAdmin = await Product.findById(adminDisabled._id).lean();
  assert.strictEqual(stillAdmin.isActive, false);
  assert.strictEqual(stillAdmin.deactivatedBy, 'admin');

  // Nothing else is restored.
  assert.strictEqual((await Offer.findById(approved._id).lean()).status, 'stopped');
  assert.strictEqual((await Advertisement.findById(onlyPackage._id).lean()).items.length, 0);
  assert.ok(w1);
});

test('an admin catalog re-import never reactivates a withdrawn item', async () => {
  const item = await ProductCatalog.create({ nameAr: 'دواء قديم', manufacturerAr: 'شركة الاستيراد' });
  await catalogService.deactivateCatalogItem(item._id);

  const report = await catalogService.importFromExcel(
    await workbookBuffer('شركة الاستيراد', [['دواء قديم', 3, 'USD']])
  );
  assert.strictEqual(report.withdrawn.length, 1);
  assert.strictEqual(report.updated, 0);
  const fresh = await ProductCatalog.findById(item._id).lean();
  assert.strictEqual(fresh.isActive, false);
  assert.strictEqual(fresh.priceUsd, null);
});

test('adding a product the warehouse disabled itself re-enables it with the new price', async () => {
  const { user, warehouse } = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'دواء معاد', manufacturerAr: 'شركة' });
  await Product.create({
    warehouseId: warehouse._id,
    masterProductId: item._id,
    ...productFields({ price: 4, manuallyDisabled: true, isAvailable: false }),
  });

  const product = await warehouseProductService.createProduct(
    warehouse._id,
    { masterProductId: String(item._id), categoryId: ids.category, unitAr: 'علبة', unitEn: 'Box', priceUsd: 6 },
    { userId: user._id }
  );
  assert.strictEqual(product.$locals.reEnabled, true);
  assert.strictEqual(product.manuallyDisabled, false);
  assert.strictEqual(product.isAvailable, true);
  assert.strictEqual(product.price, 6);
  assert.strictEqual(await Product.countDocuments({ warehouseId: warehouse._id, masterProductId: item._id }), 1);
  const history = (await Product.findById(product._id).lean()).priceHistory;
  assert.deepStrictEqual(history.map((h) => [h.oldPrice, h.newPrice]), [[4, 6]]);
});

test('adding a withdrawn, an admin-disabled or a live product is refused with a clear code', async () => {
  const { user, warehouse } = await makeWarehouse();
  const body = (item) => ({
    masterProductId: String(item._id),
    categoryId: ids.category,
    unitAr: 'علبة',
    unitEn: 'Box',
    priceUsd: 2,
  });

  const withdrawn = await ProductCatalog.create({ nameAr: 'مسحوب', manufacturerAr: 'شركة', isActive: false });
  await assert.rejects(
    warehouseProductService.createProduct(warehouse._id, body(withdrawn), { userId: user._id }),
    expectCode('CATALOG_ITEM_WITHDRAWN')
  );

  const adminItem = await ProductCatalog.create({ nameAr: 'معطل اداريا', manufacturerAr: 'شركة' });
  const adminProduct = await Product.create({ warehouseId: warehouse._id, masterProductId: adminItem._id, ...productFields() });
  await adminProductService.deactivateProduct(adminProduct._id);
  await assert.rejects(
    warehouseProductService.createProduct(warehouse._id, body(adminItem), { userId: user._id }),
    expectCode('PRODUCT_DISABLED_BY_ADMIN')
  );

  const liveItem = await ProductCatalog.create({ nameAr: 'فعال', manufacturerAr: 'شركة' });
  await Product.create({ warehouseId: warehouse._id, masterProductId: liveItem._id, ...productFields() });
  await assert.rejects(
    warehouseProductService.createProduct(warehouse._id, body(liveItem), { userId: user._id }),
    expectCode('PRODUCT_ALREADY_LINKED')
  );
});

test('the warehouse import puts withdrawn and admin-disabled rows in their own bucket, never "updated"', async () => {
  const { user, warehouse } = await makeWarehouse();
  const withdrawn = await ProductCatalog.create({ nameAr: 'مسحوب للاستيراد', manufacturerAr: 'شركة الملف' });
  const adminItem = await ProductCatalog.create({ nameAr: 'معطل للاستيراد', manufacturerAr: 'شركة الملف' });
  const selfItem = await ProductCatalog.create({ nameAr: 'موقوف ذاتيا', manufacturerAr: 'شركة الملف' });
  await Product.create({ warehouseId: warehouse._id, masterProductId: withdrawn._id, ...productFields() });
  await catalogService.deactivateCatalogItem(withdrawn._id);
  await Product.create({
    warehouseId: warehouse._id,
    masterProductId: adminItem._id,
    ...productFields({ isActive: false, deactivatedBy: 'admin' }),
  });
  await Product.create({
    warehouseId: warehouse._id,
    masterProductId: selfItem._id,
    ...productFields({ manuallyDisabled: true, isAvailable: false }),
  });

  const report = await warehouseProductService.importProductsFromExcel(
    warehouse._id,
    user._id,
    await workbookBuffer('شركة الملف', [
      ['مسحوب للاستيراد', 7, 'USD'],
      ['معطل للاستيراد', 7, 'USD'],
      ['موقوف ذاتيا', 7, 'USD'],
    ])
  );
  assert.deepStrictEqual(report.blocked.map((b) => b.code).sort(), ['CATALOG_ITEM_WITHDRAWN', 'PRODUCT_DISABLED_BY_ADMIN']);
  assert.strictEqual(report.updated, 1);
  const adminProduct = await Product.findOne({ masterProductId: adminItem._id }).lean();
  assert.strictEqual(adminProduct.price, 5, 'an admin-disabled product is left untouched');
  const self = await Product.findOne({ masterProductId: selfItem._id }).lean();
  assert.strictEqual(self.manuallyDisabled, false);
  assert.strictEqual(self.isAvailable, true);
  assert.strictEqual(self.price, 7);
});

test('M5: two edits of the same product cannot silently overwrite each other', async () => {
  const { user, warehouse } = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'تعديل متزامن', manufacturerAr: 'شركة' });
  const created = await Product.create({ warehouseId: warehouse._id, masterProductId: item._id, ...productFields({ price: 10 }) });

  const asWarehouse = await Product.findById(created._id);
  const asAdmin = await Product.findById(created._id);
  await warehouseProductService.applyProductUpdate(asWarehouse, user._id, { priceUsd: 11 });
  await assert.rejects(
    warehouseProductService.applyProductUpdate(asAdmin, user._id, { priceUsd: 12 }),
    expectCode('PRODUCT_CHANGED')
  );
  const fresh = await Product.findById(created._id).lean();
  assert.strictEqual(fresh.price, 11);
  assert.deepStrictEqual(fresh.priceHistory.map((h) => [h.oldPrice, h.newPrice]), [[10, 11]]);
});

test('M5: approving a stale version of a parked offer edit is refused with OFFER_CHANGED', async () => {
  const { user, warehouse } = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'عرض متزامن', manufacturerAr: 'شركة' });
  const product = await Product.create({ warehouseId: warehouse._id, masterProductId: item._id, ...productFields() });
  const offer = await offerOn(warehouse._id, product._id, 'approved');
  const edit = (discountPercentage) => ({
    productId: String(product._id),
    titleAr: 'عرض',
    titleEn: 'Offer',
    discountPercentage,
    startDate: new Date(Date.now() - 3600000).toISOString(),
    endDate: new Date(Date.now() + 86400000).toISOString(),
  });

  await warehouseOfferService.updateOffer(offer._id, warehouse._id, edit(20));
  const seenVersion = (await Offer.findById(offer._id).lean()).__v;
  await warehouseOfferService.updateOffer(offer._id, warehouse._id, edit(35));

  await assert.rejects(
    adminOfferService.approveOffer(offer._id, user._id, { expectedVersion: seenVersion }),
    expectCode('OFFER_CHANGED')
  );
  assert.strictEqual((await Offer.findById(offer._id).lean()).discountPercentage, 10);

  const currentVersion = (await Offer.findById(offer._id).lean()).__v;
  await adminOfferService.approveOffer(offer._id, user._id, { expectedVersion: currentVersion });
  assert.strictEqual((await Offer.findById(offer._id).lean()).discountPercentage, 35);
});

test('a stopped offer can no longer be edited by the warehouse or the admin', async () => {
  const { warehouse } = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'عرض موقوف', manufacturerAr: 'شركة' });
  const product = await Product.create({ warehouseId: warehouse._id, masterProductId: item._id, ...productFields() });
  const offer = await offerOn(warehouse._id, product._id, 'approved');
  await catalogService.deactivateCatalogItem(item._id);

  const body = {
    productId: String(product._id),
    titleAr: 'x',
    titleEn: 'x',
    discountPercentage: 5,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 86400000).toISOString(),
  };
  await assert.rejects(warehouseOfferService.updateOffer(offer._id, warehouse._id, body), expectCode('OFFER_STOPPED'));
  await assert.rejects(adminOfferService.adminUpdateOffer(offer._id, body), expectCode('OFFER_STOPPED'));
});
