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
  assert.strictEqual(first.linked, 18 * 3, 'every first demo medicine is linked to a catalog item');
  assert.strictEqual(first.logos, 3);
  assert.ok(first.discounts > 0);
  assert.ok(first.stocked > ITEMS.length);

  const items = await ProductCatalog.find({ imageUrl: { $ne: null } }).lean();
  assert.strictEqual(items.length, ITEMS.length);
  assert.ok(items.every((i) => i.imageUrl.startsWith('https://media.test/media/')));

  const again = await seedDemoCatalogImages();
  assert.deepStrictEqual(again, { uploaded: 0, stocked: 0, linked: 0, logos: 0, discounts: 0, dated: 0 });
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
  assert.match(glucomet.productionDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(glucomet.expiryDate > glucomet.productionDate);

  const manufacturers = await call('GET', `/warehouses/${warehouseId}/manufacturers`, { token });
  assert.ok(JSON.stringify(manufacturers.body).includes('السعد'));
});

test('a warehouse sets, changes and clears the batch dates on its product', async () => {
  const { DEMO_WAREHOUSE_PASSWORD, WAREHOUSES } = require('../src/services/demoSeed.service');
  const login = await call('POST', '/auth/login-password', {
    body: { phone: WAREHOUSES[0].phone, password: DEMO_WAREHOUSE_PASSWORD },
  });
  const token = login.body.token;
  const list = await call('GET', '/warehouse/products/search?search=GLUCOMET', { token });
  assert.strictEqual(list.status, 200, JSON.stringify(list.body));
  const id = list.body.products[0].id;

  const set = await call('PATCH', `/warehouse/products/${id}`, {
    token,
    body: { productionDate: '2026-01-15', expiryDate: '2028-01-15' },
  });
  assert.strictEqual(set.status, 200, JSON.stringify(set.body));
  assert.strictEqual(set.body.product.productionDate, '2026-01-15');
  assert.strictEqual(set.body.product.expiryDate, '2028-01-15');

  const bad = await call('PATCH', `/warehouse/products/${id}`, { token, body: { expiryDate: 'soon' } });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.code, 'INVALID_DATE');

  const cleared = await call('PATCH', `/warehouse/products/${id}`, { token, body: { productionDate: null } });
  assert.strictEqual(cleared.body.product.productionDate, null);
  assert.strictEqual(cleared.body.product.expiryDate, '2028-01-15');
});

test('every demo medicine card has its six facts: name, ingredient, price, form, expiry - and a picture or logo', async () => {
  const login = await call('POST', '/auth/login-password', { body: { phone: '0931111111', password: 'pharmacy-pass-1' } });
  const token = login.body.token;
  const { body } = await call('GET', '/warehouses', { token });
  assert.ok(body.warehouses.every((w) => w.logo && w.logo.startsWith('https://media.test/media/')), 'every warehouse has a logo');
  let after = null;
  const all = [];
  do {
    const page = await call('GET', `/warehouses/${body.warehouses[0].id}/products?limit=100${after ? `&after=${after}` : ''}`, { token });
    all.push(...page.body.products);
    after = page.body.pagination.hasMore ? page.body.pagination.nextCursor : null;
  } while (after);
  assert.ok(all.length > 100, `only ${all.length} products`);
  for (const p of all) {
    assert.ok(p.nameAr, 'name');
    assert.ok(p.activeIngredient, `ingredient missing on ${p.nameAr}`);
    assert.ok(p.dosageForm, `form missing on ${p.nameAr}`);
    assert.ok(p.expiryDate, `expiry missing on ${p.nameAr}`);
    assert.strictEqual(typeof p.priceUsd, 'number');
  }
  assert.ok(all.some((p) => p.discountPriceUsd < p.priceUsd), 'some show a price before and after a discount');
  assert.ok(all.filter((p) => p.image).length >= 90, 'most have a picture');
});
