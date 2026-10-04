// The medicine directory the phone downloads once and keeps: every catalog item,
// light, in pages by id; incremental with `since`; only for signed-in pharmacies
// and warehouses; and small on the wire (gzip).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-catalog-directory-0000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const catalogService = require('../src/services/productCatalog.service');

const tokens = {};
let server;
let baseUrl;

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(baseUrl + path, { headers });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
}

// Walks the whole directory the way the phone does.
async function downloadAll(query = '') {
  const items = [];
  let cursor = null;
  for (let guard = 0; guard < 100; guard += 1) {
    const params = new URLSearchParams(query);
    params.set('limit', '10');
    if (cursor) params.set('after', cursor);
    const { status, body } = await get(`/catalog/directory?${params}`, tokens.pharmacy);
    assert.strictEqual(status, 200);
    items.push(...body.items);
    if (!body.pagination.hasMore) return items;
    cursor = body.pagination.nextCursor;
  }
  throw new Error('the directory never ended');
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-directory-test' });
  await syncIndexes(ProductCatalog, Manufacturer);
  const users = await User.create([
    { name: 'AD', phone: '0952001301', role: 'admin', status: 'active' },
    { name: 'WH', phone: '0942001301', role: 'warehouse', status: 'active' },
    { name: 'PH', phone: '0932001301', role: 'pharmacy', status: 'active' },
    { name: 'PP', phone: '0932001302', role: 'pharmacy', status: 'pending' },
  ]);
  for (const [key, user] of [['admin', users[0]], ['warehouse', users[1]], ['pharmacy', users[2]], ['pendingPharmacy', users[3]]]) {
    tokens[key] = jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: '1h' });
  }
  // 25 live items (enough that the response is worth compressing) and one withdrawn.
  for (let i = 1; i <= 25; i += 1) {
    await ProductCatalog.create({
      nameAr: `دواء رقم ${String(i).padStart(2, '0')}`,
      manufacturerAr: i % 2 ? 'ألفا للأدوية' : 'بيتا للأدوية',
      ...(i === 1 ? { nameEn: 'Med One', activeIngredient: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet', imageUrl: 'https://x/1.webp' } : {}),
    });
  }
  await ProductCatalog.create({ nameAr: 'دواء سُحب', manufacturerAr: 'ألفا للأدوية', isActive: false });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test('only a signed-in, approved pharmacy or warehouse may download the directory', async () => {
  assert.strictEqual((await get('/catalog/directory', null)).status, 401);
  assert.strictEqual((await get('/catalog/directory', tokens.admin)).status, 403);
  assert.strictEqual((await get('/catalog/directory', tokens.pendingPharmacy)).status, 403);
  assert.strictEqual((await get('/catalog/directory', tokens.pharmacy)).status, 200);
  assert.strictEqual((await get('/catalog/directory', tokens.warehouse)).status, 200);
});

test('paging by cursor delivers every live item once and nothing withdrawn', async () => {
  const items = await downloadAll();
  assert.strictEqual(items.length, 25);
  assert.strictEqual(new Set(items.map((i) => i.id)).size, 25);
  assert.ok(!items.some((i) => i.nameAr === 'دواء سُحب'));
});

test('an item carries what the phone needs to show and search it, and leaves out what is empty', async () => {
  const items = await downloadAll();
  const full = items.find((i) => i.nameAr === 'دواء رقم 01');
  assert.deepStrictEqual(
    { ...full, id: undefined, updatedAt: undefined },
    {
      id: undefined,
      updatedAt: undefined,
      nameAr: 'دواء رقم 01',
      nameEn: 'Med One',
      manufacturerAr: 'ألفا للأدوية',
      activeIngredient: 'Paracetamol',
      strength: '500 mg',
      dosageForm: 'Tablet',
      imageUrl: 'https://x/1.webp',
    },
  );
  assert.ok(full.updatedAt);
  const bare = items.find((i) => i.nameAr === 'دواء رقم 02');
  assert.deepStrictEqual(Object.keys(bare).sort(), ['id', 'manufacturerAr', 'nameAr', 'updatedAt']);
});

test('the limit is bounded, and a malformed cursor or date is a clean 400', async () => {
  for (const bad of ['limit=0', 'limit=3001', 'limit=abc', 'limit=1.5', 'after=not-an-id', 'since=yesterday']) {
    const { status, body } = await get(`/catalog/directory?${bad}`, tokens.pharmacy);
    assert.strictEqual(status, 400, bad);
    assert.strictEqual(body.success, false, bad);
  }
  assert.strictEqual((await get('/catalog/directory?limit=3000', tokens.pharmacy)).status, 200);
  assert.strictEqual((await get('/catalog/directory?limit[a]=1', tokens.pharmacy)).status, 400);
});

test('the last page has no cursor, and an empty page is still a page', async () => {
  const { body } = await get('/catalog/directory?limit=25', tokens.pharmacy);
  assert.strictEqual(body.items.length, 25);
  assert.deepStrictEqual(body.pagination, { hasMore: false, nextCursor: null, total: 25 });
  const lastId = body.items[body.items.length - 1].id;
  const after = await get(`/catalog/directory?after=${lastId}`, tokens.pharmacy);
  assert.deepStrictEqual(after.body.items, []);
  assert.strictEqual(after.body.pagination.hasMore, false);
  assert.strictEqual(after.body.pagination.total, undefined, 'only the first page counts them');
});

test('since returns only what changed - the withdrawn ones included, so the phone can drop them', async () => {
  const mark = new Date();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const changed = await ProductCatalog.findOne({ nameAr: 'دواء رقم 05' });
  changed.imageUrl = 'https://x/5.webp';
  await changed.save();
  const gone = await ProductCatalog.findOne({ nameAr: 'دواء رقم 06' });
  gone.isActive = false;
  await gone.save();
  const fresh = await ProductCatalog.create({ nameAr: 'دواء جديد', manufacturerAr: 'ألفا للأدوية' });

  try {
    const delta = await downloadAll(`since=${mark.toISOString()}`);
    assert.deepStrictEqual(
      delta.map((i) => i.nameAr).sort(),
      ['دواء جديد', 'دواء رقم 05', 'دواء رقم 06'].sort(),
    );
    const withdrawn = delta.find((i) => i.nameAr === 'دواء رقم 06');
    assert.strictEqual(withdrawn.isActive, false);
    assert.strictEqual(delta.find((i) => i.nameAr === 'دواء رقم 05').imageUrl, 'https://x/5.webp');

    const { body } = await get('/catalog/directory', tokens.pharmacy);
    assert.ok(body.serverTime, 'the phone stores serverTime as its next `since`');
    assert.ok(new Date(body.serverTime) >= mark);
  } finally {
    changed.imageUrl = undefined;
    await changed.save();
    gone.isActive = true;
    await gone.save();
    await ProductCatalog.deleteOne({ _id: fresh._id });
  }
});

test('the service refuses a bad limit before touching the database', async () => {
  await assert.rejects(catalogService.listDirectory({ limit: 0 }), { statusCode: 400 });
  await assert.rejects(catalogService.listDirectory({ limit: 5000 }), { statusCode: 400 });
  await assert.rejects(catalogService.listDirectory({ after: 'zzz' }), { statusCode: 400 });
});

test('the download is compressed on the wire', async () => {
  const { status, headers } = await get('/catalog/directory?limit=100', tokens.pharmacy);
  assert.strictEqual(status, 200);
  assert.strictEqual(headers.get('content-encoding'), 'gzip');
});
