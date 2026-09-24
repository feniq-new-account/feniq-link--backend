// Catalog overhaul Phase 11 (M6): the catalog's main queries are served by an
// index - no collection scan, no in-memory sort - on a seeded database with
// a skewed manufacturer. The plans themselves are printed for the PR by
// scripts/explain-catalog-queries.js (same queries, test/helpers/catalogExplain.js).
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const { seedCatalog, explainCatalogQueries } = require('./helpers/catalogExplain');

let results;
let seeded;

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-explain-test' });
  seeded = await seedCatalog({ warehouses: 3, productsPerWarehouse: 1500, catalogSize: 2000 });
  results = await explainCatalogQueries(seeded);
});

test.after(async () => {
  await stopMemoryMongo();
});

const byName = (name) => results.find((r) => r.name === name);

test('no catalog query scans the whole collection or sorts in memory', () => {
  for (const r of results) {
    assert.ok(!r.stages.includes('COLLSCAN'), `${r.name}: ${r.stages.join(' <- ')}`);
    assert.ok(!r.stages.includes('SORT'), `${r.name} sorts in memory: ${r.stages.join(' <- ')}`);
    assert.ok(r.indexes.length > 0, `${r.name} uses no index`);
  }
});

test('a pharmacist page reads a page, not the warehouse - even for the skewed manufacturer', () => {
  for (const name of ['pharmacist products, no manufacturer', 'pharmacist products, skewed manufacturer']) {
    const r = byName(name);
    assert.ok(r.docsExamined <= 25, `${name}: ${r.docsExamined} docs examined`);
  }
  assert.deepStrictEqual(byName('pharmacist products, skewed manufacturer').indexes, ['warehouse_manufacturer_page']);
});

test('the rename count and the recall go through the masterProductId index', () => {
  for (const name of ['rename countDocuments', 'recall: linked products']) {
    const r = byName(name);
    assert.ok(r.indexes.some((i) => i.startsWith('masterProductId')), `${name}: ${r.indexes}`);
    // Only the linked products (one per warehouse here), never the collection.
    assert.ok(r.docsExamined <= 3 || r.keysExamined <= 3, `${name}: keys ${r.keysExamined} docs ${r.docsExamined}`);
  }
  assert.ok(byName('recall updateMany').indexes.includes('_id_'));
});

test('the manufacturers list is a covered query: no product document is fetched', () => {
  const r = byName('warehouse manufacturers list');
  assert.deepStrictEqual(r.indexes, ['warehouse_manufacturer_page']);
  assert.strictEqual(r.docsExamined, 0);
  assert.ok(r.stages.includes('PROJECTION_COVERED'), r.stages.join(' <- '));
});

test('the admin warehouse + rare manufacturer filter keeps to the index, in _id order', () => {
  const r = byName('admin warehouse + rare manufacturer');
  assert.ok(!r.stages.includes('SORT'), r.stages.join(' <- '));
  assert.strictEqual(r.keysExamined, r.returned);
});
