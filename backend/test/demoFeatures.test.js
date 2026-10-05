// Demo data for every feature: after the full demo seed chain a pharmacy
// has an order history, ratings, returns, a complaint and a payment, and each
// demo warehouse a live banner, package and discount code.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feniq-demo-features-'));
process.env.MEDIA_DIR = mediaDir;
process.env.MEDIA_PUBLIC_URL = 'https://media.test/media';
process.env.DISABLE_AUTH_RATE_LIMIT = '1';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const demo = require('../src/services/demoSeed.service');
const { seedDemoCatalogImages } = require('../src/services/demoCatalogImages.service');
const { seedDemoFeatures } = require('../src/services/demoFeatures.service');
const { setManualRate } = require('../src/services/exchangeRate.service');

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

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-demo-features-test' });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

test('every feature gets demo data, once, visible over the API', async () => {
  await setManualRate(13800);
  const password = 'pharmacy-pass-1';
  await call('POST', '/auth/register', {
    body: { name: 'P', pharmacyName: 'P', phone: '0932222222', address: 'x', areaType: 'city', password, confirmPassword: password },
  });
  await demo.seedDemoAdminIfNone();
  await demo.seedDemoDataIfEmpty();
  await seedDemoCatalogImages();
  await demo.seedDemoOrders();
  await demo.turnOffDemoSealPhoto();

  const report = await seedDemoFeatures();
  for (const [key, value] of Object.entries(report)) {
    assert.strictEqual(typeof value, 'number', `${key}: ${value}`);
    assert.ok(value > 0, `${key} created nothing`);
  }

  const again = await seedDemoFeatures();
  for (const [key, value] of Object.entries(again)) {
    if (key === 'reviews') continue; // new delivered orders could earn ratings; there are none here
    assert.strictEqual(value, 0, `${key} ran twice`);
  }

  const pharmacy = (await call('POST', '/auth/login-password', { body: { phone: '0932222222', password } })).body.token;
  const orders = await call('GET', '/orders?limit=50', { token: pharmacy });
  assert.ok(orders.body.orders.length >= 10, `orders: ${orders.body.orders.length}`);
  assert.ok(orders.body.orders.some((o) => o.status === 'cancelled'));
  assert.strictEqual((await call('GET', '/returns', { token: pharmacy })).status, 200);
  assert.strictEqual((await call('GET', '/complaints', { token: pharmacy })).status, 200);
  const banners = await call('GET', '/banners/active', { token: pharmacy });
  assert.ok(banners.body.banners.length >= 3, 'a live banner per demo warehouse');
});
