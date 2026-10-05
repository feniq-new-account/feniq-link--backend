// The pictured demo medicines: uploaded once through the normal image path,
// stocked by the demo warehouses, and served to the pharmacy with their
// picture, strength and dosage form.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feniq-demo-media-'));
process.env.MEDIA_DIR = mediaDir;
process.env.MEDIA_PUBLIC_URL = 'https://media.test/media';
process.env.DISABLE_AUTH_RATE_LIMIT = '1';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const ProductCatalog = require('../src/models/productCatalog.model');
const { seedDemoDataIfEmpty } = require('../src/services/demoSeed.service');
const { seedDemoCatalogImages, ITEMS } = require('../src/services/demoCatalogImages.service');

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
  await startMemoryMongo({ dbName: 'feniq-demo-images-test' });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

test('uploads every picture once and stocks the demo warehouses', async () => {
  await seedDemoDataIfEmpty();
  const first = await seedDemoCatalogImages();
  assert.strictEqual(first.uploaded, ITEMS.length);
  assert.ok(first.stocked > ITEMS.length);

  const items = await ProductCatalog.find({ imageUrl: { $ne: null } }).lean();
  assert.strictEqual(items.length, ITEMS.length);
  assert.ok(items.every((i) => i.imageUrl.startsWith('https://media.test/media/')));

  const again = await seedDemoCatalogImages();
  assert.deepStrictEqual(again, { uploaded: 0, stocked: 0 });
});

test('the pharmacy sees the pictured medicines with image, strength and form', async () => {
  const password = 'pharmacy-pass-1';
  const reg = await call('POST', '/auth/register', {
    body: { name: 'P', pharmacyName: 'P', phone: '0931111111', address: 'x', areaType: 'city', password, confirmPassword: password },
  });
  const { token } = reg.body;
  const { body } = await call('GET', '/warehouses', { token });
  const warehouseId = body.warehouses[0].id;

  const products = await call('GET', `/warehouses/${warehouseId}/products?search=GLUCOMET`, { token });
  assert.strictEqual(products.status, 200, JSON.stringify(products.body));
  const glucomet = products.body.products.find((p) => p.nameAr === 'GLUCOMET-500 TAB.');
  assert.ok(glucomet, JSON.stringify(products.body).slice(0, 500));
  assert.ok(glucomet.image && glucomet.image.startsWith('https://media.test/media/'));
  assert.strictEqual(glucomet.strength, '500 MG');
  assert.strictEqual(glucomet.dosageForm, 'أقراص');

  const manufacturers = await call('GET', `/warehouses/${warehouseId}/manufacturers`, { token });
  assert.ok(JSON.stringify(manufacturers.body).includes('السعد'));
});
