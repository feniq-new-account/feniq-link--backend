// Catalog overhaul Phase 11 (L1): malformed input on the catalog routes is a
// 400 with one of our codes - never a 500 TypeError or a leaked CastError -
// and authentication still comes first (401/403 before any 400).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-catalog-malformed-tests-00000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const { mapLibraryError } = require('../src/middlewares/errorHandler');

const tokens = {};
const ids = {};
let server;
let baseUrl;

async function call(method, path, { token, body, rawBody } = {}) {
  const init = { method, headers: token ? { Authorization: `Bearer ${token}` } : {} };
  if (rawBody !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = rawBody;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(baseUrl + path, init);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-malformed-test' });
  const [whUser, adminUser, pharmacyUser] = await User.create([
    { name: 'WH', phone: '0942001101', role: 'warehouse', status: 'active' },
    { name: 'AD', phone: '0952001101', role: 'admin', status: 'active' },
    { name: 'PH', phone: '0932001101', role: 'pharmacy', status: 'active' },
  ]);
  tokens.warehouse = jwt.sign({ sub: String(whUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.admin = jwt.sign({ sub: String(adminUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.pharmacy = jwt.sign({ sub: String(pharmacyUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  const warehouse = await Warehouse.create({
    userId: whUser._id, nameAr: 'م', nameEn: 'Warehouse', address: 'r', city: 'Latakia',
    phone: '0942001101', deliveryType: 'self', isActive: true,
  });
  ids.warehouse = warehouse._id;

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

// --- non-string query values ------------------------------------------------

const QUERY_ROUTES = [
  ['warehouse', '/warehouse/products/search'],
  ['warehouse', '/warehouse/products'],
  ['warehouse', '/warehouse/catalog/search'],
  ['warehouse', '/warehouse/manufacturers'],
  ['admin', '/admin/products'],
  ['admin', '/admin/catalog'],
  ['admin', '/admin/manufacturers'],
  ['pharmacy', () => `/warehouses/${ids.warehouse}/products`],
  ['pharmacy', () => `/warehouses/${ids.warehouse}/manufacturers`],
];

for (const [role, route] of QUERY_ROUTES) {
  const path = () => (typeof route === 'function' ? route() : route);
  test(`${role} ${typeof route === 'string' ? route : 'warehouse route'}: repeated or nested query values are 400`, async () => {
    for (const query of ['search=a&search=b', 'search[x]=1', 'manufacturer[$ne]=x']) {
      const res = await call('GET', `${path()}?${query}`, { token: tokens[role] });
      assert.strictEqual(res.status, 400, `${path()}?${query}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.code, 'INVALID_QUERY_PARAM');
    }
  });
}

// --- ObjectId params ----------------------------------------------------------

test('a malformed id in the path is 400 INVALID_ID, not a CastError or 500', async () => {
  const cases = [
    ['PATCH', '/warehouse/products/not-an-id', tokens.warehouse, {}],
    ['POST', '/warehouse/products/123/image', tokens.warehouse, undefined],
    ['GET', '/warehouse/products/imports/zzz', tokens.warehouse, undefined],
    ['GET', '/warehouse/products/imports/zzz/rows', tokens.warehouse, undefined],
    ['PATCH', '/admin/products/abc', tokens.admin, {}],
    ['PATCH', '/admin/catalog/abc', tokens.admin, {}],
    ['DELETE', '/admin/catalog/abc/image', tokens.admin, undefined],
    ['PATCH', '/admin/manufacturers/abc', tokens.admin, {}],
    ['GET', '/warehouses/abc/products', tokens.pharmacy, undefined],
    ['GET', '/warehouses/abc/manufacturers', tokens.pharmacy, undefined],
    // A 12-character string passes mongoose's own isValid - still refused.
    ['GET', '/warehouses/abcdefghijkl/products', tokens.pharmacy, undefined],
  ];
  for (const [method, path, token, body] of cases) {
    const res = await call(method, path, { token, body });
    assert.strictEqual(res.status, 400, `${method} ${path}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.code, 'INVALID_ID', `${method} ${path}`);
  }
});

test('authentication comes before input checks', async () => {
  assert.strictEqual((await call('GET', '/warehouses/abc/products')).status, 401);
  assert.strictEqual((await call('PATCH', '/warehouse/products/not-an-id', { body: {} })).status, 401);
  assert.strictEqual((await call('GET', '/admin/catalog?search=a&search=b')).status, 401);
  // Wrong role: 403, whatever the input.
  assert.strictEqual((await call('PATCH', '/admin/catalog/abc', { token: tokens.warehouse, body: {} })).status, 403);
  assert.strictEqual((await call('GET', '/warehouse/products?search[x]=1', { token: tokens.pharmacy })).status, 403);
  assert.strictEqual((await call('GET', `/warehouses/${ids.warehouse}/products`, { token: tokens.warehouse })).status, 403);
});

test('a valid but unknown id is still a 404', async () => {
  const res = await call('PATCH', `/warehouse/products/${new mongoose.Types.ObjectId()}`, { token: tokens.warehouse, body: {} });
  assert.strictEqual(res.status, 404);
});

// --- bodies -------------------------------------------------------------------

test('a body that is not JSON is 400 INVALID_JSON', async () => {
  const res = await call('PATCH', `/warehouse/products/${new mongoose.Types.ObjectId()}`, {
    token: tokens.warehouse,
    rawBody: '{"priceUsd": 5,',
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'INVALID_JSON');
});

test('wrongly typed body values on a product are 400s', async () => {
  const product = await Product.create({ warehouseId: ids.warehouse, nameAr: 'دواء', manufacturerAr: 'شركة', price: 5 });
  for (const body of [{ priceUsd: 'free' }, { priceUsd: -1 }, { categoryId: 'not-an-id' }, { unit: 'bucket' }, { bonus: 'lots' }]) {
    const res = await call('PATCH', `/warehouse/products/${product._id}`, { token: tokens.warehouse, body });
    assert.strictEqual(res.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.code, JSON.stringify(body));
  }
});

// --- the error mapping itself -----------------------------------------------------

test('CastError, ValidationError and VersionError map to 400/400/409 without internals', () => {
  const cast = new mongoose.Error.CastError('ObjectId', 'zzz', 'warehouseId');
  assert.deepStrictEqual(
    { status: mapLibraryError(cast).statusCode, code: mapLibraryError(cast).code, message: mapLibraryError(cast).message },
    { status: 400, code: 'INVALID_ID', message: 'Invalid warehouseId.' }
  );
  assert.strictEqual(mapLibraryError(new mongoose.Error.CastError('Number', 'x', 'price')).code, 'INVALID_VALUE');

  const invalid = new Product({}).validateSync();
  const mapped = mapLibraryError(invalid);
  assert.strictEqual(mapped.statusCode, 400);
  assert.strictEqual(mapped.code, 'VALIDATION_ERROR');
  assert.ok(mapped.details.fields.includes('price'));
  assert.ok(!/validation failed|Path `/.test(mapped.message), mapped.message);

  const version = new mongoose.Error.VersionError(new Product({}), 0, []);
  assert.strictEqual(mapLibraryError(version).statusCode, 409);
  assert.strictEqual(mapLibraryError(version).code, 'VERSION_CONFLICT');

  // Our own errors and anything unknown pass through untouched.
  assert.strictEqual(mapLibraryError({ isApiError: true, statusCode: 404 }), null);
  assert.strictEqual(mapLibraryError(new Error('boom')), null);
});
