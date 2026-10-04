// The admin's picture work list: the image filter on the catalog list and the
// image statistics (totals, how sure the bulk-linked pictures are, and the
// companies with the most items still without one).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-image-stats-padding!';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const catalogService = require('../src/services/productCatalog.service');

const make = (nameAr, manufacturerAr, extra = {}) => ProductCatalog.create({ nameAr, manufacturerAr, ...extra });
const names = async (filter) => (await catalogService.listCatalog({ image: filter, limit: 100 })).items.map((i) => i.nameAr).sort();

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-image-stats-test' });
  await syncIndexes(ProductCatalog, Manufacturer);
  await make('A exact', 'ألفا', { imageUrl: 'https://x/a.webp', imageMatch: 'exact' });
  await make('B brand', 'ألفا', { imageUrl: 'https://x/b.webp', imageMatch: 'brand' });
  await make('C fuzzy', 'بحري', { imageUrl: 'https://x/c.webp', imageMatch: 'fuzzy' });
  await make('D uploaded', 'بحري', { imageUrl: 'https://x/d.webp' });
  await make('E none', 'بحري');
  await make('F none', 'بحري');
  await make('G none', 'ألفا');
  await make('H withdrawn', 'ألفا', { isActive: false });
});

test.after(async () => {
  await stopMemoryMongo();
});

test('the list can be narrowed to items without a picture, with one, or with an approximate one', async () => {
  assert.deepStrictEqual(await names('missing'), ['E none', 'F none', 'G none', 'H withdrawn']);
  assert.deepStrictEqual(await names('present'), ['A exact', 'B brand', 'C fuzzy', 'D uploaded']);
  assert.deepStrictEqual(await names('approx'), ['B brand', 'C fuzzy']);
  assert.strictEqual((await names(undefined)).length, 8);
});

test('an unknown picture filter is refused', async () => {
  await assert.rejects(catalogService.listCatalog({ image: 'whatever' }), { statusCode: 400 });
});

test('the picture filter combines with the company filter', async () => {
  const { items } = await catalogService.listCatalog({ image: 'missing', manufacturer: 'بحري' });
  assert.deepStrictEqual(items.map((i) => i.nameAr).sort(), ['E none', 'F none']);
});

test('the statistics count what has a picture and how sure the bulk-linked ones are', async () => {
  const stats = await catalogService.imageStats();
  assert.strictEqual(stats.total, 7, 'a withdrawn item is not counted');
  assert.strictEqual(stats.withImage, 4);
  assert.strictEqual(stats.withoutImage, 3);
  assert.deepStrictEqual(stats.byMatch, { exact: 1, brand: 1, fuzzy: 1, uploaded: 1 });
});

test('the companies with the most items still without a picture come first', async () => {
  const { topMissingCompanies } = await catalogService.imageStats();
  assert.deepStrictEqual(topMissingCompanies, [
    { manufacturerAr: 'بحري', total: 4, missing: 2 },
    { manufacturerAr: 'ألفا', total: 3, missing: 1 },
  ]);
});
