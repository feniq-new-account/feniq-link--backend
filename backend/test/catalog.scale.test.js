// Catalog overhaul Phase 2 (H1, H2, H5): the pharmacist catalog read is one
// warehouse-scoped Mongo query per page, whatever the data looks like.
//
//  - A RARE manufacturer among 50,000 products used to be filtered in Node,
//    batch after batch (fetchMatchingPage), until a page filled up - so its
//    cost grew with the warehouse. Now: exactly one product query per page.
//  - An unknown manufacturer (?manufacturer=zzz) used to scan the whole
//    warehouse. Now: an index seek that examines no documents at all.
//  - A search term matching more than 500 catalog items used to be cut at
//    500 master-list ids (an arbitrary 500, in natural order), silently losing
//    the warehouse's product if it was not among them. Now: found.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-catalog-scale-tests-00000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const { listWarehouseProducts } = require('../src/services/product.service');
const { buildProductFilter } = require('../src/services/productCatalog.service');

const PRODUCT_COUNT = 50000;
const RARE_POSITIONS = [10, 25000, 49990];
const ids = {};

// Counts the queries each call sends to the products collection.
let productQueries = 0;
function countProductQueries(collectionName, method) {
  if (collectionName === 'products' && ['find', 'findOne', 'aggregate', 'distinct'].includes(method)) {
    productQueries += 1;
  }
}

// The executionStats of one pharmacist page, built exactly as
// listWarehouseProducts builds it (same filter, _id order, limit + 1).
async function pageStats(options, limit) {
  const filter = buildProductFilter({ warehouseId: ids.warehouse, ...options });
  const plan = await Product.find(filter).sort({ _id: 1 }).limit(limit + 1).explain('executionStats');
  return plan.executionStats ?? plan[0].executionStats;
}

async function queriesFor(fn) {
  productQueries = 0;
  mongoose.set('debug', countProductQueries);
  try {
    const result = await fn();
    return { result, queries: productQueries };
  } finally {
    mongoose.set('debug', false);
  }
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-scale-test' });
  await syncIndexes(Product, ProductCatalog);

  const user = await User.create({ name: 'WH', phone: '0944000001', role: 'warehouse', status: 'active' });
  const warehouse = await Warehouse.create({
    userId: user._id,
    nameAr: 'مستودع',
    nameEn: 'Warehouse',
    address: 'r',
    city: 'Latakia',
    phone: '0944000001',
    isActive: true,
  });
  ids.warehouse = warehouse._id;

  // 50,000 legacy-shaped products (keys set directly - a bulk insert, the
  // same shape the model hook writes), all under one common manufacturer
  // except three spread across the warehouse under a rare one.
  const rare = new Set(RARE_POSITIONS);
  for (let start = 0; start < PRODUCT_COUNT; start += 10000) {
    const batch = [];
    for (let i = start; i < start + 10000; i += 1) {
      const isRare = rare.has(i);
      batch.push({
        warehouseId: ids.warehouse,
        masterProductId: null,
        nameAr: `دواء ${i}`,
        nameKey: `دواء ${i}`,
        manufacturerAr: isRare ? 'شركة نادرة' : 'شركة شائعة',
        manufacturerKey: isRare ? 'شركه نادره' : 'شركه شايعه',
        price: 1,
        isActive: true,
        isAvailable: true,
        manuallyDisabled: false,
        priceHistory: [],
        bonuses: [],
      });
    }
    await Product.collection.insertMany(batch);
  }
});

test.after(async () => {
  await stopMemoryMongo();
});

test('a rare manufacturer among 50,000 products costs ONE product query per page', async () => {
  const { result, queries } = await queriesFor(() =>
    listWarehouseProducts(ids.warehouse, { manufacturer: 'شركة نادرة', limit: 2 })
  );
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.hasMore, true);
  assert.strictEqual(queries, 1);

  const next = await queriesFor(() =>
    listWarehouseProducts(ids.warehouse, { manufacturer: 'شركة نادرة', limit: 2, after: result.nextCursor })
  );
  assert.strictEqual(next.result.items.length, 1);
  assert.strictEqual(next.result.hasMore, false);
  assert.strictEqual(next.queries, 1);
});

// Pinned (owner, before merge): the manufacturer filter is an equality on
// manufacturerKey served by the warehouse_manufacturer_page index - every key
// the page reads is a row it returns, however few of the 50,000 match.
test('a rare manufacturer page examines exactly the keys it returns', async () => {
  for (const limit of [2, 20]) {
    const stats = await pageStats({ manufacturer: 'شركة نادرة' }, limit);
    assert.strictEqual(stats.nReturned, Math.min(limit + 1, RARE_POSITIONS.length));
    assert.strictEqual(stats.totalKeysExamined, stats.nReturned, `limit ${limit}`);
    assert.strictEqual(stats.totalDocsExamined, stats.nReturned, `limit ${limit}`);
  }
});

test('the manufacturer filter tolerates spelling variants of the name', async () => {
  const { items } = await listWarehouseProducts(ids.warehouse, { manufacturer: 'شركه  نادره', limit: 10 });
  assert.strictEqual(items.length, 3);
});

test('?manufacturer=zzz is cheap: one query, no document examined', async () => {
  const { result, queries } = await queriesFor(() =>
    listWarehouseProducts(ids.warehouse, { manufacturer: 'zzz', limit: 20 })
  );
  assert.strictEqual(result.items.length, 0);
  assert.strictEqual(queries, 1);

  const stats = await pageStats({ manufacturer: 'zzz' }, 20);
  assert.strictEqual(stats.nReturned, 0);
  assert.strictEqual(stats.totalKeysExamined, stats.nReturned);
  assert.strictEqual(stats.totalDocsExamined, 0);
});

test('a term matching more than 500 catalog items still finds the warehouse\'s product', async () => {
  const items = [];
  for (let i = 0; i < 600; i += 1) {
    items.push({ nameAr: `شراب سعال ${i}`, manufacturerAr: 'شركة الشراب' });
  }
  const created = await ProductCatalog.create(items);
  const last = created[created.length - 1];
  await Product.create({ warehouseId: ids.warehouse, masterProductId: last._id, price: 4 });

  const { items: found } = await listWarehouseProducts(ids.warehouse, { search: 'شراب', limit: 20 });
  assert.strictEqual(found.length, 1);
  assert.strictEqual(String(found[0].product.masterProductId?._id ?? found[0].product.masterProductId), String(last._id));
});

test('the warehouse-wide search works without a manufacturer and pages with one query each', async () => {
  const { result, queries } = await queriesFor(() =>
    listWarehouseProducts(ids.warehouse, { search: 'دواء 4999', limit: 5 })
  );
  // "دواء 4999", "دواء 49990".."دواء 49999"
  assert.strictEqual(result.items.length, 5);
  assert.strictEqual(result.hasMore, true);
  assert.strictEqual(queries, 1);
});
