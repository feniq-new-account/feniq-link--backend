// An exceptional offer can be a better bonus at the same price: the product's
// usual 10+2 becomes 10+3 while the offer runs - on the card, in the offers
// list and in the order - and the price is untouched.
process.env.DISABLE_AUTH_RATE_LIMIT = '1';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const demo = require('../src/services/demoSeed.service');
const { setManualRate } = require('../src/services/exchangeRate.service');
const OrderItem = require('../src/models/orderItem.model');

let server;
let baseUrl;
async function call(method, urlPath, { body, token } = {}) {
  const response = await fetch(baseUrl + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
const login = async (phone, password) => (await call('POST', '/auth/login-password', { body: { phone, password } })).body.token;

let tokens;
let product;
let warehouseId;

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-offer-bonus-type-test' });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  await setManualRate(13800);
  await demo.seedDemoAdminIfNone();
  await demo.seedDemoDataIfEmpty();
  const password = 'pharmacy-pass-1';
  await call('POST', '/auth/register', {
    body: { name: 'P', pharmacyName: 'P', phone: '0933333333', address: 'x', areaType: 'city', password, confirmPassword: password },
  });
  tokens = {
    pharmacy: await login('0933333333', password),
    warehouse: await login(demo.WAREHOUSES[0].phone, demo.DEMO_WAREHOUSE_PASSWORD),
    admin: await login(demo.DEMO_ADMIN.phone, demo.DEMO_ADMIN.password),
  };
  const list = await call('GET', '/warehouse/products/search?search=Omeprazole', { token: tokens.warehouse });
  product = list.body.products[0];
  const set = await call('PATCH', `/warehouse/products/${product.id}`, { token: tokens.warehouse, body: { bonus: '10+2' } });
  assert.strictEqual(set.status, 200, JSON.stringify(set.body));
  warehouseId = (await call('GET', '/warehouses', { token: tokens.pharmacy })).body.warehouses.find((w) => w.phone === demo.WAREHOUSES[0].phone).id;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

const window = () => ({
  startDate: new Date(Date.now() - 86400000).toISOString(),
  endDate: new Date(Date.now() + 10 * 86400000).toISOString(),
});

test('a bonus offer that gives nothing more than the usual bonus is refused', async () => {
  const res = await call('POST', '/warehouse/offers', {
    token: tokens.warehouse,
    body: { productId: product.id, titleAr: 'ع', titleEn: 'o', offerType: 'bonus', bonuses: '10+2', ...window() },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'OFFER_BONUS_UNCHANGED');
});

test('10+3 instead of 10+2 at the same price: card, offers list and order', async () => {
  const created = await call('POST', '/warehouse/offers', {
    token: tokens.warehouse,
    body: { productId: product.id, titleAr: 'بونص إضافي', titleEn: 'Extra bonus', offerType: 'bonus', bonuses: '10+3', ...window() },
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  assert.strictEqual(created.body.offer.offerType, 'bonus');
  assert.deepStrictEqual(created.body.offer.bonuses, [{ buy: 10, free: 3 }]);

  const approved = await call('POST', `/admin/offers/${created.body.offer.id}/approve`, { token: tokens.admin, body: {} });
  assert.strictEqual(approved.status, 200, JSON.stringify(approved.body));

  const products = await call('GET', `/warehouses/${warehouseId}/products?search=Omeprazole`, { token: tokens.pharmacy });
  const card = products.body.products.find((p) => p.id === product.id);
  assert.deepStrictEqual(card.bonuses, [{ buy: 10, free: 3 }]);
  assert.deepStrictEqual(card.regularBonuses, [{ buy: 10, free: 2 }]);
  assert.strictEqual(card.discountPriceUsd, card.priceUsd, 'a bonus offer leaves the price alone');
  assert.strictEqual(card.offer.offerType, 'bonus');

  const offers = await call('GET', '/offers/active', { token: tokens.pharmacy });
  const listed = offers.body.offers.find((o) => o.productId === product.id);
  assert.strictEqual(listed.offerType, 'bonus');
  assert.deepStrictEqual(listed.regularBonuses, [{ buy: 10, free: 2 }]);

  const order = await call('POST', '/orders', {
    token: tokens.pharmacy,
    body: { warehouseId, items: [{ productId: product.id, quantity: 10 }] },
  });
  assert.strictEqual(order.status, 201, JSON.stringify(order.body));
  const line = await OrderItem.findOne({ productId: product.id }).lean();
  assert.strictEqual(line.freeQuantity, 3);
  assert.deepStrictEqual(line.bonusApplied, { buy: 10, free: 3 });
});
