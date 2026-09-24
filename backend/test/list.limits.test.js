// Catalog overhaul Phase 10 (H4, L8): no product list endpoint returns more
// than one page. `/warehouse/products` and `/admin/products` used to return
// everything when no `limit` was sent (what the web pickers relied on); now no
// limit means the default page, a page is at most 100 rows (a larger limit is
// 400 INVALID_LIMIT), and no list response carries priceHistory.
//
// With more than 100 products seeded, a list that ignored the cap would return
// them all - so each check below fails if an endpoint ever goes unbounded
// again.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-list-limit-tests-00000000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Category = require('../src/models/category.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Product = require('../src/models/product.model');
const Banner = require('../src/models/banner.model');

const MAX_LIMIT = 100;
const SEEDED = 130;

const ids = {};
const tokens = {};
let server;
let baseUrl;

async function get(path, token) {
  const response = await fetch(baseUrl + path, { headers: { Authorization: `Bearer ${token}` } });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-list-limits-test' });
  const [whUser, adminUser, pharmacyUser] = await User.create([
    { name: 'WH', phone: '0942001001', role: 'warehouse', status: 'active' },
    { name: 'AD', phone: '0952001001', role: 'admin', status: 'active' },
    { name: 'PH', phone: '0932001001', role: 'pharmacy', status: 'active' },
  ]);
  tokens.warehouse = jwt.sign({ sub: String(whUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.admin = jwt.sign({ sub: String(adminUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.pharmacy = jwt.sign({ sub: String(pharmacyUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  const warehouse = await Warehouse.create({
    userId: whUser._id, nameAr: 'م', nameEn: 'Warehouse', address: 'r', city: 'Latakia',
    phone: '0942001001', deliveryType: 'self', isActive: true,
  });
  ids.warehouse = warehouse._id;
  const category = await Category.create({ nameAr: 'فئة', nameEn: 'Category' });

  const catalog = await ProductCatalog.create(
    Array.from({ length: SEEDED }, (_, i) => ({ nameAr: `بنادول ${i}`, nameEn: `Panadol ${i}`, manufacturerAr: 'شركة الحدود' }))
  );
  const products = await Product.create(
    catalog.map((item, i) => ({
      warehouseId: warehouse._id,
      masterProductId: item._id,
      categoryId: category._id,
      price: 5,
      isActive: true,
      // One in ten paused - `available=true` must leave them out.
      isAvailable: i % 10 !== 0,
      manuallyDisabled: i % 10 === 0,
      priceHistory: [{ oldPrice: 4, newPrice: 5, changedBy: whUser._id, changedAt: new Date() }],
    }))
  );
  ids.firstProduct = products[1]._id;
  ids.warehouseUser = whUser._id;

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

// Every product list endpoint, with the key its rows come back under.
const ENDPOINTS = [
  { name: 'warehouse product list', path: () => '/warehouse/products', role: 'warehouse', key: 'products' },
  { name: 'warehouse product search', path: () => '/warehouse/products/search', role: 'warehouse', key: 'products' },
  { name: 'admin product list', path: () => '/admin/products', role: 'admin', key: 'products' },
  { name: 'pharmacist catalog', path: () => `/warehouses/${ids.warehouse}/products`, role: 'pharmacy', key: 'products' },
  { name: 'admin catalog', path: () => '/admin/catalog', role: 'admin', key: 'items' },
];

function withQuery(path, query) {
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}

for (const endpoint of ENDPOINTS) {
  test(`${endpoint.name}: no limit gives one default page, never everything`, async () => {
    const res = await get(endpoint.path(), tokens[endpoint.role]);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const rows = res.body[endpoint.key];
    assert.ok(rows.length > 0 && rows.length < SEEDED, `${rows.length} rows`);
    assert.ok(rows.length <= MAX_LIMIT);
    assert.strictEqual(res.body.pagination.hasMore, true);
  });

  test(`${endpoint.name}: a page holds at most ${MAX_LIMIT} rows`, async () => {
    const res = await get(withQuery(endpoint.path(), `limit=${MAX_LIMIT}`), tokens[endpoint.role]);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body[endpoint.key].length, MAX_LIMIT);
    assert.strictEqual(res.body.pagination.hasMore, true);
  });

  test(`${endpoint.name}: a limit above ${MAX_LIMIT} is refused`, async () => {
    const res = await get(withQuery(endpoint.path(), `limit=${MAX_LIMIT + 1}`), tokens[endpoint.role]);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'INVALID_LIMIT');
  });

  test(`${endpoint.name}: no row carries priceHistory (L8)`, async () => {
    const res = await get(withQuery(endpoint.path(), 'limit=5'), tokens[endpoint.role]);
    for (const row of res.body[endpoint.key]) assert.ok(!('priceHistory' in row), endpoint.name);
  });
}

test('the whole warehouse list is still reachable page by page', async () => {
  const seen = new Set();
  let after = null;
  do {
    const res = await get(`/warehouse/products?limit=${MAX_LIMIT}${after ? `&after=${after}` : ''}`, tokens.warehouse);
    assert.strictEqual(res.status, 200);
    res.body.products.forEach((p) => seen.add(String(p.id)));
    after = res.body.pagination.hasMore ? res.body.pagination.nextCursor : null;
  } while (after);
  assert.strictEqual(seen.size, SEEDED);
});

test('available=true on the search leaves paused products out (the order-edit picker)', async () => {
  const res = await get('/warehouse/products/search?search=panadol&available=true&limit=100', tokens.warehouse);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.products.length > 0);
  assert.ok(res.body.products.every((p) => p.isAvailable === true));
  const all = await get('/warehouse/products/search?search=panadol&limit=100', tokens.warehouse);
  assert.ok(all.body.products.some((p) => p.isAvailable === false));
});

test('the warehouse banner list names each linked product (the edit picker label)', async () => {
  await Banner.create({
    warehouseId: ids.warehouse,
    bannerNumber: 1,
    createdBy: ids.warehouseUser,
    imageUrl: 'https://res.cloudinary.com/x/image/upload/b.png',
    productId: ids.firstProduct,
    title: 'Banner',
    status: 'pending',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
  });
  const res = await get('/warehouse/banners?limit=10', tokens.warehouse);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const banner = res.body.banners[0];
  assert.strictEqual(String(banner.productId), String(ids.firstProduct));
  assert.strictEqual(banner.productNameAr, 'بنادول 1');
  assert.strictEqual(banner.productNameEn, 'Panadol 1');
});
