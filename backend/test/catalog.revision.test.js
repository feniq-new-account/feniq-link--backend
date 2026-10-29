process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'catalog-revision-test-secret-at-least-32-characters';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const Offer = require('../src/models/offer.model');
const { getCatalogRevision } = require('../src/services/catalogRevision.service');
let warehouse, product, master, manufacturer;
test.before(async () => {
  await startMemoryMongo({ dbName: 'catalog-revision' });
  const owner = await User.create({ name: 'Owner', phone: '+963944000002', role: 'warehouse', status: 'active' });
  warehouse = await Warehouse.create({ userId: owner.id, nameAr: 'مستودع', nameEn: 'Warehouse', address: 'Latakia', city: 'Latakia', phone: owner.phone });
  manufacturer = await Manufacturer.create({ nameAr: 'شركة الاختبار' });
  master = await ProductCatalog.create({ nameAr: 'MED 500', manufacturerAr: manufacturer.nameAr, manufacturerId: manufacturer.id, strength: '500 MG', dosageForm: 'TABLET' });
  product = await Product.create({ warehouseId: warehouse.id, masterProductId: master.id,
    manufacturerId: manufacturer.id, nameAr: 'MED 500', manufacturerAr: manufacturer.nameAr,
    unitAr: 'علبة', price: 10, isActive: true, isAvailable: true });
});
test.after(stopMemoryMongo);
test('stable content has a stable digest; metadata never exposes inventory quantities', async () => {
  const a = await getCatalogRevision(warehouse.id);
  assert.deepEqual(Object.keys(a).sort(), ['checkedAt', 'productCount', 'revision']);
  assert.equal(a.productCount, 1);
  assert.match(a.revision, /^[a-f0-9]{64}$/);
  assert.equal((await getCatalogRevision(warehouse.id)).revision, a.revision);
});
test('same-timestamp price edits and central medicine edits invalidate the digest', async () => {
  const a = await getCatalogRevision(warehouse.id);
  await Product.updateOne({ _id: product.id }, { $set: { price: 12 } }, { timestamps: false });
  const b = await getCatalogRevision(warehouse.id);
  assert.notEqual(b.revision, a.revision);
  await ProductCatalog.updateOne({ _id: master.id }, { $set: { strength: '1000 MG' } }, { timestamps: false });
  assert.notEqual((await getCatalogRevision(warehouse.id)).revision, b.revision);
});
test('scheduled offer start and expiry change the digest without a database edit', async () => {
  await Offer.create({ warehouseId: warehouse.id, productId: product.id, titleAr: 'عرض', titleEn: 'Offer',
    discountPercentage: 10, status: 'approved', startDate: new Date('2026-10-30T10:00:00Z'), endDate: new Date('2026-10-30T12:00:00Z') });
  const before = await getCatalogRevision(warehouse.id, new Date('2026-10-30T09:59:59Z'));
  const active = await getCatalogRevision(warehouse.id, new Date('2026-10-30T11:00:00Z'));
  const after = await getCatalogRevision(warehouse.id, new Date('2026-10-30T12:00:01Z'));
  assert.notEqual(active.revision, before.revision);
  assert.equal(after.revision, before.revision);
});
test('hiding a product removes it from the completeness count and invalidates the digest', async () => {
  const before = await getCatalogRevision(warehouse.id);
  await Product.updateOne({ _id: product.id }, { $set: { isActive: false } });
  const after = await getCatalogRevision(warehouse.id);
  assert.equal(after.productCount, 0);
  assert.notEqual(after.revision, before.revision);
});
test('an unavailable warehouse cannot be probed', async () => {
  await Warehouse.updateOne({ _id: warehouse.id }, { $set: { isActive: false } });
  await assert.rejects(getCatalogRevision(warehouse.id), (error) => error.statusCode === 404);
});
