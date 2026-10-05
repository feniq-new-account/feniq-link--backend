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
const {
  seedDemoDataIfEmpty,
  seedDemoOrders,
  seedDemoAdminIfNone,
  turnOffDemoSealPhoto,
  DEMO_ADMIN,
  DEMO_WAREHOUSE_PASSWORD,
  WAREHOUSES,
  DEMO_ORDERS,
} = require('../src/services/demoSeed.service');
const { setManualRate } = require('../src/services/exchangeRate.service');

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

test('demo orders: one per stage for each pharmacy, visible to both sides, seeded once', async () => {
  await setManualRate(13800);
  const first = await seedDemoOrders();
  assert.strictEqual(first.orders, DEMO_ORDERS.length);

  const login = await call('POST', '/auth/login-password', {
    body: { phone: '0931234567', password: 'pharmacy-pass-1' },
  });
  const mine = await call('GET', '/orders', { token: login.body.token });
  assert.strictEqual(mine.status, 200, JSON.stringify(mine.body));
  const statuses = mine.body.orders.map((o) => o.status).sort();
  assert.deepStrictEqual(statuses, DEMO_ORDERS.map(([, status]) => status).sort());

  const warehouse = await call('POST', '/auth/login-password', {
    body: { phone: WAREHOUSES[0].phone, password: DEMO_WAREHOUSE_PASSWORD },
  });
  const queue = await call('GET', '/warehouse/orders', { token: warehouse.body.token });
  assert.strictEqual(queue.status, 200, JSON.stringify(queue.body));
  const expected = DEMO_ORDERS.filter(([index]) => index === 0).length;
  assert.strictEqual(queue.body.orders.length, expected);

  // A pharmacy that already has orders is left alone.
  assert.strictEqual((await seedDemoOrders()).orders, 0);
});

test('a demo warehouse can log in with the demo password', async () => {
  const res = await call('POST', '/auth/login-password', {
    body: { phone: WAREHOUSES[0].phone, password: DEMO_WAREHOUSE_PASSWORD },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.user.role, 'warehouse');
});

test('a demo admin is created only while there is no admin, and can sign in', async () => {
  const created = await seedDemoAdminIfNone();
  assert.strictEqual(created.phone, DEMO_ADMIN.phone);
  assert.strictEqual(await seedDemoAdminIfNone(), null);

  const res = await call('POST', '/auth/login-password', {
    body: { phone: DEMO_ADMIN.phone, password: DEMO_ADMIN.password },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.user.role, 'admin');
});

test('the seal photo is turned off on the demo warehouses and their open orders', async () => {
  const Order = require('../src/models/order.model');
  await Warehouse.updateMany({}, { $set: { requireDeliverySealPhoto: true } });
  await Order.updateMany({ status: { $ne: 'delivered' } }, { $set: { requiresDeliverySealPhoto: true } });
  const changed = await turnOffDemoSealPhoto();
  assert.ok(changed > 0);
  assert.strictEqual(await Warehouse.countDocuments({ requireDeliverySealPhoto: true }), 0);
  assert.strictEqual(await Order.countDocuments({ requiresDeliverySealPhoto: true, status: { $nin: ['delivered', 'cancelled'] } }), 0);
});
