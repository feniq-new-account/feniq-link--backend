// Catalog overhaul Phase 5 - catalog requests (approve / merge / reject) and
// the admin's duplicate review.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-catalog-requests-tests-00000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const Offer = require('../src/models/offer.model');
const Advertisement = require('../src/models/advertisement.model');
const CatalogRequest = require('../src/models/catalogRequest.model');
const CatalogDuplicateReview = require('../src/models/catalogDuplicateReview.model');
const WarehouseProductAlias = require('../src/models/warehouseProductAlias.model');

const requestService = require('../src/services/catalogRequest.service');
const mergeService = require('../src/services/catalogMerge.service');
const { listWarehouseProducts } = require('../src/services/product.service');
const dedupe = require('../scripts/migrations/04-dedupe-catalog');

const expectCode = (code) => (err) => {
  assert.strictEqual(err.code, code);
  return true;
};

let seq = 0;
async function makeWarehouse() {
  seq += 1;
  const phone = `09470${String(seq).padStart(5, '0')}`;
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
  return warehouse._id;
}

const adminId = new mongoose.Types.ObjectId();

async function pendingRequest(warehouseId, extra = {}) {
  return CatalogRequest.create({
    warehouseId,
    nameAr: 'دواء مطلوب',
    manufacturerAr: 'شركة جديدة',
    unit: 'box',
    priceUsd: 4.5,
    bonuses: [{ buy: 10, free: 1 }],
    ...extra,
  });
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-requests-test' });
  await syncIndexes(Product, Manufacturer, WarehouseProductAlias, CatalogRequest);
  await ProductCatalog.init();
});

test.after(async () => {
  await stopMemoryMongo();
});

test('a pending request creates no product; approving creates the item, the product and the alias', async () => {
  const warehouseId = await makeWarehouse();
  const request = await pendingRequest(warehouseId);
  assert.strictEqual(await Product.countDocuments({ warehouseId }), 0);

  // Unknown manufacturer: the admin has to confirm creating it.
  await assert.rejects(requestService.approveRequest(request._id, adminId, {}), expectCode('MANUFACTURER_CONFIRMATION_REQUIRED'));

  const approved = await requestService.approveRequest(request._id, adminId, {
    nameAr: 'دواء مطلوب 500',
    createManufacturer: true,
  });
  assert.strictEqual(approved.status, 'approved');
  const item = await ProductCatalog.findById(approved.resolvedMasterProductId).lean();
  assert.strictEqual(item.nameAr, 'دواء مطلوب 500');
  assert.ok(await Manufacturer.exists({ _id: item.manufacturerId }));
  // The central catalog has no price - the request's price is the warehouse's.
  assert.ok(!('priceUsd' in item), 'no price on the catalog item');

  // The warehouse's product gets the request's price, unit and bonus.
  const product = await Product.findById(approved.productId).lean();
  assert.strictEqual(String(product.warehouseId), String(warehouseId));
  assert.strictEqual(String(product.masterProductId), String(item._id));
  assert.strictEqual(product.price, 4.5);
  assert.strictEqual(product.unit, 'box');
  assert.deepStrictEqual(product.bonuses.map((b) => [b.buy, b.free]), [[10, 1]]);
  assert.strictEqual(await WarehouseProductAlias.countDocuments({ warehouseId, masterProductId: item._id }), 1);

  const { items } = await listWarehouseProducts(warehouseId, {});
  assert.strictEqual(items.length, 1, 'visible to pharmacists once approved');

  await assert.rejects(requestService.approveRequest(request._id, adminId, {}), expectCode('CATALOG_REQUEST_ALREADY_DECIDED'));
});

test('approving a request that names an existing item is refused as a merge candidate', async () => {
  const warehouseId = await makeWarehouse();
  const existing = await ProductCatalog.create({ nameAr: 'موجود مسبقا', manufacturerAr: 'شركة قائمة' });
  const request = await pendingRequest(warehouseId, { nameAr: 'موجود  مسبقاً', manufacturerAr: 'شركة قائمة' });
  await assert.rejects(requestService.approveRequest(request._id, adminId, {}), (err) => {
    assert.strictEqual(err.code, 'CATALOG_ITEM_ALREADY_EXISTS');
    assert.strictEqual(String(err.details.masterProductId), String(existing._id));
    return true;
  });
});

test('merging links the request to an existing item', async () => {
  const warehouseId = await makeWarehouse();
  const existing = await ProductCatalog.create({ nameAr: 'بنادول', manufacturerAr: 'جي اس كي' });
  const request = await pendingRequest(warehouseId, { nameAr: 'بانادول تابلت', manufacturerAr: 'GSK' });
  const merged = await requestService.mergeRequest(request._id, adminId, { masterProductId: String(existing._id) });
  assert.strictEqual(merged.status, 'merged');
  const product = await Product.findOne({ warehouseId, masterProductId: existing._id }).lean();
  assert.strictEqual(product.price, 4.5);
  assert.ok(await WarehouseProductAlias.exists({ warehouseId, rawNameKey: 'بانادول تابلت', masterProductId: existing._id }));
});

test('rejecting needs a reason, keeps it for the warehouse, and creates nothing', async () => {
  const warehouseId = await makeWarehouse();
  const request = await pendingRequest(warehouseId);
  await assert.rejects(requestService.rejectRequest(request._id, adminId, {}), expectCode('REJECTION_REASON_REQUIRED'));
  const rejected = await requestService.rejectRequest(request._id, adminId, { reason: 'اسم غير واضح' });
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.rejectReason, 'اسم غير واضح');
  assert.strictEqual(await Product.countDocuments({ warehouseId }), 0);

  const { rows } = await requestService.listRequests({ warehouseId });
  assert.strictEqual(rows[0].request.rejectReason, 'اسم غير واضح');
});

test('duplicate review: the admin picks the survivor and, per warehouse, which product to keep', async () => {
  // Duplicates can only exist without the unique identity index (a legacy
  // database) - drop it for this scenario.
  await ProductCatalog.collection.dropIndex('identityKey_1').catch(() => {});
  const warehouseId = await makeWarehouse();
  const [a, b] = await ProductCatalog.collection
    .insertMany([
      { nameAr: 'فيتامين د', nameKey: 'فيتامين د', manufacturerAr: 'شركة', manufacturerKey: 'شركه', identityKey: 'فيتامين د|شركه', isActive: true },
      { nameAr: 'فيتامين  د', nameKey: 'فيتامين د', manufacturerAr: 'شركة', manufacturerKey: 'شركه', identityKey: 'فيتامين د|شركه', isActive: true },
    ])
    .then((r) => Object.values(r.insertedIds));
  const keep = await Product.create({ warehouseId, masterProductId: a, price: 3 });
  const drop = await Product.create({ warehouseId, masterProductId: b, price: 4 });
  const offer = await Offer.create({
    warehouseId,
    productId: drop._id,
    titleAr: 'ع',
    titleEn: 'o',
    discountPercentage: 5,
    startDate: new Date(Date.now() - 1000),
    endDate: new Date(Date.now() + 86400000),
    status: 'approved',
  });
  const pack = await Advertisement.create({
    warehouseId,
    titleAr: 'ب',
    titleEn: 'p',
    items: [{ productId: drop._id, quantity: 2 }, { productId: keep._id, quantity: 1 }],
    totalPriceUsd: 5,
    startDate: new Date(Date.now() - 1000),
    endDate: new Date(Date.now() + 86400000),
  });

  await dedupe.run({ apply: true });
  const review = await CatalogDuplicateReview.findOne({ status: 'open' }).lean();
  assert.deepStrictEqual(review.reasons, ['warehouse_linked_to_several']);

  const { rows } = await mergeService.listDuplicateReviews();
  assert.strictEqual(rows[0].items.length, 2);

  await assert.rejects(
    mergeService.resolveDuplicateReview(review._id, adminId, { survivorId: String(a) }),
    expectCode('MERGE_PRODUCT_CHOICE_REQUIRED')
  );
  await mergeService.resolveDuplicateReview(review._id, adminId, {
    survivorId: String(a),
    keepProductByWarehouse: { [String(warehouseId)]: String(keep._id) },
  });

  assert.strictEqual(await ProductCatalog.countDocuments({ identityKey: 'فيتامين د|شركه' }), 1);
  assert.strictEqual(await Product.exists({ _id: drop._id }), null);
  assert.strictEqual(String((await Offer.findById(offer._id).lean()).productId), String(keep._id), 'the offer moved onto the kept product');
  const packAfter = await Advertisement.findById(pack._id).lean();
  assert.deepStrictEqual(packAfter.items.map((i) => [String(i.productId), i.quantity]), [[String(keep._id), 3]]);
  assert.strictEqual((await CatalogDuplicateReview.findById(review._id).lean()).status, 'resolved');
});
