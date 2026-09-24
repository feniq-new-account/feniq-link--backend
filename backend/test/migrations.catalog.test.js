// The catalog-overhaul migrations (scripts/migrations/00..06, MIGRATIONS.md),
// run in order against legacy-shaped documents inserted straight through the
// driver (no model hooks), exactly as they sit in a database written before
// the overhaul:
//   - a dry run writes nothing;
//   - --apply does what each script documents;
//   - a second run finds nothing left to do.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-catalog-migrations-0000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const ProductCatalog = require('../src/models/productCatalog.model');
const CatalogDuplicateReview = require('../src/models/catalogDuplicateReview.model');

const migrations = [
  require('../scripts/migrations/00-manufacturers'),
  require('../scripts/migrations/01-manufacturer-discounts'),
  require('../scripts/migrations/02-search-keys'),
  require('../scripts/migrations/03-deactivated-by'),
  require('../scripts/migrations/04-dedupe-catalog'),
  require('../scripts/migrations/05-remove-barcode'),
  require('../scripts/migrations/06-drop-legacy-indexes'),
];

const { ObjectId } = mongoose.Types;
const ids = {};
let db;

async function snapshot() {
  const names = ['productcatalogs', 'products', 'manufacturers', 'manufacturerdiscounts', 'warehousemanufacturers'];
  const out = {};
  for (const name of names) {
    out[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
  }
  return JSON.stringify(out);
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-migrations-test' });
  db = mongoose.connection.db;
  // Model compilation already ran autoIndex on the empty collection; drop the
  // new unique identityKey index so the legacy rows (which have no key yet) can
  // be inserted - on a real legacy database that build fails anyway.
  await ProductCatalog.init();
  await ProductCatalog.collection.dropIndex('identityKey_1').catch(() => {});

  const w1 = new ObjectId();
  const w2 = new ObjectId();
  const user = new ObjectId();
  ids.w1 = w1;

  const catalog = db.collection('productcatalogs');
  await catalog.createIndex({ nameAr: 1, manufacturerAr: 1 }, { unique: true, name: 'nameAr_1_manufacturerAr_1' });
  const item = (nameAr, manufacturerAr, extra = {}) => ({
    _id: new ObjectId(),
    nameAr,
    manufacturerAr,
    nameEn: null,
    manufacturerEn: null,
    isActive: true,
    nameHistory: [],
    ...extra,
  });
  ids.A = item('باراسيتامول', 'شركة الشرق', { manufacturerEn: 'East Co' });
  ids.B = item('فيتامين', 'شركه  الشرق'); // same company, other spelling
  ids.C = item('أموكسيسيلين', 'شركة الشرق');
  ids.D = item('اموكسيسيلين', 'شركة الشرق', { imageUrl: 'https://res.cloudinary.com/x/amox.png' }); // dup of C, safe
  ids.E = item('بروفين', 'ابن سينا');
  ids.F = item('بروفين ', 'إبن سينا'); // dup of E, but w1 stocks both
  ids.G = item('دواء', 'x', { isActive: false });
  ids.H = item('دوآء', 'x'); // dup of G, mixed active state
  await catalog.insertMany([ids.A, ids.B, ids.C, ids.D, ids.E, ids.F, ids.G, ids.H]);

  const products = db.collection('products');
  await products.createIndex({ nameAr: 1 }, { name: 'nameAr_1' });
  const product = (masterProductId, extra = {}) => ({
    _id: new ObjectId(),
    warehouseId: w1,
    masterProductId,
    price: 1,
    isActive: true,
    isAvailable: true,
    manuallyDisabled: false,
    priceHistory: [],
    ...extra,
  });
  ids.pC = product(ids.C._id, { barcode: '123' });
  ids.pD = product(ids.D._id, { warehouseId: w2 });
  ids.pE = product(ids.E._id);
  ids.pF = product(ids.F._id);
  ids.pRecalled = product(ids.G._id, { isActive: false });
  ids.pAdmin = product(ids.A._id, { isActive: false, barcode: null });
  ids.pLegacy = product(null, { nameAr: 'قديم', manufacturerAr: 'شركة  الشرق' });
  await products.insertMany(Object.values(ids).filter((v) => v && v.price !== undefined));

  const discounts = db.collection('manufacturerdiscounts');
  await discounts.createIndex({ warehouseId: 1, manufacturerAr: 1 }, { unique: true, name: 'warehouseId_1_manufacturerAr_1' });
  await discounts.insertMany([
    { warehouseId: w1, manufacturerAr: 'شركة الشرق', discountPercentage: 5 },
    { warehouseId: w1, manufacturerAr: 'شركه الشرق', discountPercentage: 10 },
    { warehouseId: w1, manufacturerAr: 'مجهول', discountPercentage: 3 },
  ]);
  const registry = db.collection('warehousemanufacturers');
  await registry.insertMany([
    { warehouseId: w1, manufacturerAr: 'شركة الشرق' },
    { warehouseId: w1, manufacturerAr: 'شركه الشرق' },
  ]);
  ids.user = user;
});

test.after(async () => {
  await stopMemoryMongo();
});

test('a dry run of every migration writes nothing', async () => {
  const before = await snapshot();
  for (const migration of migrations) await migration.run({ apply: false });
  assert.strictEqual(await snapshot(), before);
});

test('00: one Manufacturer per normalized name, canonical spelling on the catalog, products linked', async () => {
  const report = await migrations[0].run({ apply: true });
  assert.strictEqual(report.droppedRawIndex, true);
  const manufacturers = await db.collection('manufacturers').find({}).toArray();
  assert.strictEqual(manufacturers.length, 3);
  const east = manufacturers.find((m) => m.key === 'شركه الشرق');
  assert.strictEqual(east.nameAr, 'شركة الشرق'); // most frequent spelling
  assert.strictEqual(east.nameEn, 'East Co');
  // The English key the warehouse import resolves 'East Co' by.
  assert.strictEqual(east.enKey, 'east co');

  const b = await db.collection('productcatalogs').findOne({ _id: ids.B._id });
  assert.strictEqual(b.manufacturerAr, 'شركة الشرق');
  assert.strictEqual(String(b.manufacturerId), String(east._id));
  const legacy = await db.collection('products').findOne({ _id: ids.pLegacy._id });
  assert.strictEqual(String(legacy.manufacturerId), String(east._id));
  const linked = await db.collection('products').findOne({ _id: ids.pC._id });
  assert.strictEqual(String(linked.manufacturerId), String(east._id));
});

test('01: discounts and registry merge onto the manufacturer - higher discount kept and reported, unmatched listed', async () => {
  const report = await migrations[1].run({ apply: true });
  const discounts = await db.collection('manufacturerdiscounts').find({ manufacturerId: { $ne: null } }).toArray();
  assert.strictEqual(discounts.length, 1);
  assert.strictEqual(discounts[0].discountPercentage, 10);
  assert.strictEqual(discounts[0].manufacturerAr, 'شركة الشرق');
  assert.strictEqual(report.discounts.clashes.length, 1);
  assert.deepStrictEqual(report.discounts.unmatched.map((u) => u.manufacturerAr), ['مجهول']);
  assert.ok(await db.collection('manufacturerdiscounts').findOne({ manufacturerAr: 'مجهول' }), 'unmatched row is kept');
  assert.strictEqual(await db.collection('warehousemanufacturers').countDocuments(), 1);
});

test('02: normalized keys on catalog items and products', async () => {
  await migrations[2].run({ apply: true });
  const c = await db.collection('productcatalogs').findOne({ _id: ids.C._id });
  const d = await db.collection('productcatalogs').findOne({ _id: ids.D._id });
  assert.strictEqual(c.identityKey, d.identityKey);
  assert.strictEqual(c.nameKey, 'اموكسيسيلين');
  const p = await db.collection('products').findOne({ _id: ids.pC._id });
  assert.strictEqual(p.nameKey, 'اموكسيسيلين');
  const legacy = await db.collection('products').findOne({ _id: ids.pLegacy._id });
  assert.strictEqual(legacy.manufacturerKey, 'شركه الشرق');
  // A manufacturer written before enKey existed gets it.
  await db.collection('manufacturers').updateMany({}, { $unset: { enKey: '' } });
  const again = await migrations[2].run({ apply: true });
  assert.ok(again.manufacturersUpdated >= 1);
  assert.strictEqual((await db.collection('manufacturers').findOne({ nameEn: 'East Co' })).enKey, 'east co');
});

test('03: inactive products get their reason', async () => {
  await migrations[3].run({ apply: true });
  const recalled = await db.collection('products').findOne({ _id: ids.pRecalled._id });
  const admin = await db.collection('products').findOne({ _id: ids.pAdmin._id });
  assert.strictEqual(recalled.deactivatedBy, 'catalog_recall');
  assert.strictEqual(admin.deactivatedBy, 'admin');
});

test('04: safe duplicates auto-merge (image kept), unsafe ones go to review, and they block the unique index', async () => {
  const report = await migrations[4].run({ apply: true });
  assert.strictEqual(report.autoMerged.length, 1);
  assert.strictEqual(report.sentToReview.length, 2);

  // C (oldest) survives, D's product and image move to it.
  assert.strictEqual(await db.collection('productcatalogs').findOne({ _id: ids.D._id }), null);
  const c = await db.collection('productcatalogs').findOne({ _id: ids.C._id });
  assert.strictEqual(c.imageUrl, 'https://res.cloudinary.com/x/amox.png');
  const pD = await db.collection('products').findOne({ _id: ids.pD._id });
  assert.strictEqual(String(pD.masterProductId), String(ids.C._id));

  const reviews = await CatalogDuplicateReview.find({ status: 'open' }).lean();
  const reasons = reviews.flatMap((r) => r.reasons).sort();
  assert.deepStrictEqual(reasons, ['mixed_active_state', 'warehouse_linked_to_several']);
  assert.match(report.identityIndex, /blocked/);
});

test('05 and 06: barcode removed, legacy index dropped, new indexes ensured', async () => {
  await migrations[5].run({ apply: true });
  assert.strictEqual(await db.collection('products').countDocuments({ barcode: { $exists: true } }), 0);
  const report = await migrations[6].run({ apply: true });
  assert.deepStrictEqual(report.droppedLegacyIndexes, ['nameAr_1']);
  const productIndexes = (await db.collection('products').indexes()).map((i) => i.name);
  assert.ok(productIndexes.includes('masterProductId_1'));
  assert.ok(productIndexes.includes('warehouse_manufacturer_page'));
  assert.ok(!productIndexes.includes('warehouseId_1_manufacturerKey_1__id_1'));
});

test('every migration is idempotent: a second apply changes nothing', async () => {
  const before = await snapshot();
  for (const migration of migrations) await migration.run({ apply: true });
  assert.strictEqual(await snapshot(), before);
});

test('04 builds the unique identityKey index once the reviews are resolved', async () => {
  // Resolve the two open groups the way the admin screen will: remove the
  // extra items (the admin merge path is covered by its own tests).
  await db.collection('products').deleteOne({ _id: ids.pF._id });
  await db.collection('productcatalogs').deleteMany({ _id: { $in: [ids.F._id, ids.H._id] } });
  const report = await migrations[4].run({ apply: true });
  assert.strictEqual(report.identityIndex, 'created');
  const index = (await ProductCatalog.collection.indexes()).find((i) => i.name === 'identityKey_1');
  assert.strictEqual(index.unique, true);
});
