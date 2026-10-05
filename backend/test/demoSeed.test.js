// The demo seed must leave a fresh database browsable end to end from the
// pharmacy app: warehouses -> manufacturers -> products, with an offer, and a
// demo warehouse able to log in.
process.env.DISABLE_AUTH_RATE_LIMIT = '1';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const app = require('../src/app');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const { seedDemoDataIfEmpty, DEMO_WAREHOUSE_PASSWORD, WAREHOUSES } = require('../src/services/demoSeed.service');

let server;
let baseUrl;

async function call(method, path, { body, token } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-demo-seed-test' });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test('seeds an empty database once, and never again', async () => {
  const first = await seedDemoDataIfEmpty();
  assert.strictEqual(first.warehouses, WAREHOUSES.length);
  assert.ok(first.products > 0);

  assert.strictEqual(await seedDemoDataIfEmpty(), null);
  assert.strictEqual(await Warehouse.countDocuments(), WAREHOUSES.length);
  assert.strictEqual(await Product.countDocuments(), first.products);
});

test('a newly registered pharmacy can browse the seeded catalog', async () => {
  const password = 'pharmacy-pass-1';
  const reg = await call('POST', '/auth/register', {
    body: {
      name: 'Demo Owner',
      pharmacyName: 'Demo Pharmacy',
      phone: '0931234567',
      address: 'Somewhere',
      areaType: 'city',
      password,
      confirmPassword: password,
    },
  });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
  const { token } = reg.body;

  const list = await call('GET', '/warehouses', { token });
  assert.strictEqual(list.status, 200, JSON.stringify(list.body));
  const { warehouses } = list.body;
  assert.strictEqual(warehouses.length, WAREHOUSES.length);

  const warehouseId = warehouses[0].id || warehouses[0]._id;
  const manufacturers = await call('GET', `/warehouses/${warehouseId}/manufacturers`, { token });
  assert.strictEqual(manufacturers.status, 200, JSON.stringify(manufacturers.body));
  assert.ok(JSON.stringify(manufacturers.body).includes('شركة الأدوية الوطنية'), JSON.stringify(manufacturers.body).slice(0, 600));

  const products = await call('GET', `/warehouses/${warehouseId}/products`, { token });
  assert.strictEqual(products.status, 200, JSON.stringify(products.body));
  const text = JSON.stringify(products.body);
  assert.ok(text.includes('Paracetamol 500mg'), text.slice(0, 600));

  const offers = await call('GET', '/offers/active', { token });
  assert.strictEqual(offers.status, 200, JSON.stringify(offers.body));
  assert.ok(JSON.stringify(offers.body).includes('Launch offer'), JSON.stringify(offers.body).slice(0, 600));
});

test('a demo warehouse can log in with the demo password', async () => {
  const res = await call('POST', '/auth/login-password', {
    body: { phone: WAREHOUSES[0].phone, password: DEMO_WAREHOUSE_PASSWORD },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.user.role, 'warehouse');
});
