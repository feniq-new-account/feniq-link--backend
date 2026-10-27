// Catalog overhaul Phase 9 - images (Cloudinary only, M7, L3).
//
//   - an image field only accepts a Cloudinary URL on OUR cloud (400
//     INVALID_IMAGE_URL otherwise); null or '' clears it, and so does an
//     empty description (L3);
//   - every response shows the effective image: the warehouse's override,
//     else the catalog item's central image - the stored override untouched;
//   - uploads (catalog image, manufacturer logo, warehouse override) go
//     through the upload service, and a replaced or cleared image is deleted
//     only when it is ours and nothing else still points at it.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-catalog-images-tests-0000000';
process.env.NODE_ENV = 'test';
process.env.CLOUDINARY_CLOUD_NAME = 'feniq-test';

// Cloudinary itself is stubbed: the upload service's exports are replaced
// before anything that destructures them is loaded.
const uploadService = require('../src/services/upload.service');
const uploaded = [];
const deleted = [];
let uploadSeq = 0;
uploadService.uploadImage = async (buffer, folder) => {
  uploadSeq += 1;
  const url = `https://res.cloudinary.com/feniq-test/image/upload/v1/${folder}/img${uploadSeq}.png`;
  uploaded.push(url);
  return url;
};
uploadService.deleteImageByUrl = async (url) => {
  deleted.push(url);
};

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
const Manufacturer = require('../src/models/manufacturer.model');
const { isOwnCloudinaryUrl, imageUrlInput } = require('../src/services/imageAsset.service');

const OURS = (name) => `https://res.cloudinary.com/feniq-test/image/upload/v1/products/${name}.png`;
// A tiny valid PNG header (the magic-bytes check reads the first 12 bytes).
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

const ids = {};
const tokens = {};
let server;
let baseUrl;

async function call(method, path, { token = tokens.warehouse, body, file } = {}) {
  const init = { method, headers: token ? { Authorization: `Bearer ${token}` } : {} };
  if (file) {
    const data = new FormData();
    data.append('image', new Blob([file], { type: 'image/png' }), 'x.png');
    init.body = data;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(baseUrl + path, init);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function makeProduct(extra = {}) {
  const catalog = await ProductCatalog.create({
    nameAr: `دواء ${Math.random()}`,
    manufacturerAr: 'شركة الصور',
    imageUrl: extra.catalogImage ?? null,
  });
  const product = await Product.create({
    warehouseId: ids.warehouse,
    masterProductId: catalog._id,
    categoryId: ids.category,
    price: 5,
    image: extra.image ?? null,
    description: extra.description ?? null,
    isActive: true,
    isAvailable: true,
  });
  return { catalog, product };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-images-test' });
  const [whUser, adminUser, pharmacyUser] = await User.create([
    { name: 'WH', phone: '0942000901', role: 'warehouse', status: 'active' },
    { name: 'AD', phone: '0952000901', role: 'admin', status: 'active' },
    { name: 'PH', phone: '0932000901', role: 'pharmacy', status: 'active' },
  ]);
  tokens.warehouse = jwt.sign({ sub: String(whUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.admin = jwt.sign({ sub: String(adminUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  tokens.pharmacy = jwt.sign({ sub: String(pharmacyUser._id) }, env.jwtSecret, { expiresIn: '1h' });
  const warehouse = await Warehouse.create({
    userId: whUser._id, nameAr: 'م', nameEn: 'Warehouse', address: 'r', city: 'Latakia',
    phone: '0942000901', deliveryType: 'self', isActive: true,
  });
  ids.warehouse = warehouse._id;
  ids.category = (await Category.create({ nameAr: 'فئة', nameEn: 'Category' }))._id;

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test.beforeEach(() => {
  uploaded.length = 0;
  deleted.length = 0;
});

// --- URL validation ---------------------------------------------------------

test('new image URLs require a trusted upload; clients may keep their current image', () => {
  assert.strictEqual(isOwnCloudinaryUrl(OURS('a')), true);
  for (const url of [
    'https://res.cloudinary.com/someone-else/image/upload/v1/a.png',
    'http://res.cloudinary.com/feniq-test/image/upload/v1/a.png',
    'https://evil.example/feniq-test/image/upload/a.png',
    'https://res.cloudinary.com.evil.example/feniq-test/image/upload/a.png',
    'https://res.cloudinary.com/feniq-test/video/upload/v1/a.mp4',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.strictEqual(isOwnCloudinaryUrl(url), false, url);
  }
  assert.strictEqual(imageUrlInput(undefined), undefined);
  assert.strictEqual(imageUrlInput(null), null);
  assert.strictEqual(imageUrlInput('  '), null);
  assert.strictEqual(imageUrlInput(` ${OURS('a')} `, { trustedUpload: true }), OURS('a'));
  assert.strictEqual(imageUrlInput(OURS('a'), { currentUrl: OURS('a') }), OURS('a'));
  assert.throws(() => imageUrlInput(OURS('a')), (err) => err.code === 'INVALID_IMAGE_URL');
  assert.throws(() => imageUrlInput('https://example.com/a.png'), (err) => err.code === 'INVALID_IMAGE_URL' && err.statusCode === 400);
  assert.throws(() => imageUrlInput({ url: OURS('a') }), (err) => err.code === 'INVALID_IMAGE_URL');
});

test('PATCH refuses copied images from our cloud, including query-string aliases', async () => {
  const central = 'https://res.cloudinary.com/feniq-test/image/upload/v1/catalog/protected.png';
  const { product } = await makeProduct({ catalogImage: central, image: OURS('own-image') });
  for (const url of [central, `${central}?copied=1`, OURS('another-warehouse')]) {
    const res = await call('PATCH', `/warehouse/products/${product._id}`, { body: { image: url } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'INVALID_IMAGE_URL');
  }
  assert.strictEqual((await Product.findById(product._id).lean()).image, OURS('own-image'));
  assert.deepStrictEqual(deleted, []);
});

test('POST refuses a copied image from our cloud', async () => {
  const catalog = await ProductCatalog.create({ nameAr: 'دواء دون صورة منسوخة', manufacturerAr: 'شركة الصور' });
  const res = await call('POST', '/warehouse/products', {
    body: { masterProductId: String(catalog._id), categoryId: String(ids.category), priceUsd: 2, unit: 'box', rateUsed: 1, image: OURS('someone-else') },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'INVALID_IMAGE_URL');
  assert.strictEqual(await Product.countDocuments({ masterProductId: catalog._id }), 0);
});

test('PATCH can keep the current image without treating it as a new upload', async () => {
  const image = OURS('keep-existing');
  const { product } = await makeProduct({ image });
  const res = await call('PATCH', `/warehouse/products/${product._id}`, { body: { image, description: 'updated' } });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual((await Product.findById(product._id).lean()).image, image);
  assert.deepStrictEqual(deleted, []);
});

test('PATCH with a foreign image URL is a 400 and changes nothing', async () => {
  const { product } = await makeProduct({ image: OURS('keep') });
  const res = await call('PATCH', `/warehouse/products/${product._id}`, { body: { image: 'https://example.com/x.png' } });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'INVALID_IMAGE_URL');
  assert.strictEqual((await Product.findById(product._id).lean()).image, OURS('keep'));
});

test('POST (create) with a foreign image URL is a 400', async () => {
  const catalog = await ProductCatalog.create({ nameAr: 'دواء جديد للصور', manufacturerAr: 'شركة الصور' });
  const res = await call('POST', '/warehouse/products', {
    body: { masterProductId: String(catalog._id), categoryId: String(ids.category), priceUsd: 2, unit: 'box', rateUsed: 1, image: 'https://example.com/x.png' },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.code, 'INVALID_IMAGE_URL');
  assert.strictEqual(await Product.countDocuments({ masterProductId: catalog._id }), 0);
});

// --- clearing (L3) ----------------------------------------------------------

test('an explicit null clears the override image and the description; the old image is released', async () => {
  const { product } = await makeProduct({ image: OURS('old'), description: 'وصف' });
  const res = await call('PATCH', `/warehouse/products/${product._id}`, { body: { image: null, description: null } });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const saved = await Product.findById(product._id).lean();
  assert.strictEqual(saved.image, null);
  assert.strictEqual(saved.description, null);
  assert.deepStrictEqual(deleted, [OURS('old')]);
});

test('an empty string clears too; a key left out changes nothing', async () => {
  const { product } = await makeProduct({ image: OURS('stay'), description: 'وصف' });
  let res = await call('PATCH', `/warehouse/products/${product._id}`, { body: { manuallyDisabled: false } });
  assert.strictEqual(res.status, 200);
  let saved = await Product.findById(product._id).lean();
  assert.strictEqual(saved.image, OURS('stay'));
  assert.strictEqual(saved.description, 'وصف');

  res = await call('PATCH', `/warehouse/products/${product._id}`, { body: { image: '', description: '' } });
  assert.strictEqual(res.status, 200);
  saved = await Product.findById(product._id).lean();
  assert.strictEqual(saved.image, null);
  assert.strictEqual(saved.description, null);
});

test('a cleared image still referenced elsewhere is not deleted from Cloudinary', async () => {
  const shared = OURS('shared');
  const { product } = await makeProduct({ image: shared });
  await makeProduct({ image: shared });
  const res = await call('PATCH', `/warehouse/products/${product._id}`, { body: { image: null } });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(deleted, []);
});

test('clearing a legacy query alias cannot delete the central catalog image', async () => {
  const shared = OURS('shared-query');
  const { product } = await makeProduct({ image: `${shared}?copied=1`, catalogImage: shared });
  const res = await call('PATCH', `/warehouse/products/${product._id}`, { body: { image: null } });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(deleted, []);
});

// --- effective image ----------------------------------------------------------

test('responses show the override, else the catalog image; the stored override is untouched', async () => {
  const central = 'https://res.cloudinary.com/feniq-test/image/upload/v1/catalog/central.png';
  const plain = await makeProduct({ catalogImage: central });
  const overridden = await makeProduct({ catalogImage: central, image: OURS('override') });

  const res = await call('GET', '/warehouse/products?limit=100');
  assert.strictEqual(res.status, 200);
  const byId = new Map(res.body.products.map((p) => [String(p.id), p]));
  const a = byId.get(String(plain.product._id));
  const b = byId.get(String(overridden.product._id));
  assert.strictEqual(a.image, central);
  assert.strictEqual(a.imageOverride, null);
  assert.strictEqual(a.catalogImageUrl, central);
  assert.strictEqual(b.image, OURS('override'));
  assert.strictEqual(b.imageOverride, OURS('override'));

  // The pharmacist catalog gets the same effective image in the old field.
  const pharmacy = await call('GET', `/warehouses/${ids.warehouse}/products?limit=100`, { token: tokens.pharmacy });
  assert.strictEqual(pharmacy.status, 200, JSON.stringify(pharmacy.body));
  const seen = pharmacy.body.products.find((p) => String(p.id) === String(plain.product._id));
  assert.strictEqual(seen.image, central);

  assert.strictEqual((await Product.findById(plain.product._id).lean()).image, null);
});

// --- uploads ------------------------------------------------------------------

test('warehouse uploads an override image; the replaced one is released', async () => {
  const { product } = await makeProduct({ image: OURS('before') });
  const res = await call('POST', `/warehouse/products/${product._id}/image`, { file: PNG });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(uploaded.length, 1);
  assert.strictEqual(res.body.product.image, uploaded[0]);
  assert.strictEqual((await Product.findById(product._id).lean()).image, uploaded[0]);
  assert.deepStrictEqual(deleted, [OURS('before')]);
});

test('an upload that is not an image is refused before it reaches Cloudinary', async () => {
  const { product } = await makeProduct();
  const res = await call('POST', `/warehouse/products/${product._id}/image`, { file: Buffer.from('not an image at all, just text') });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(uploaded.length, 0);
});

test("a warehouse cannot upload onto another warehouse's product", async () => {
  const otherUser = await User.create({ name: 'WH2', phone: '0942000902', role: 'warehouse', status: 'active' });
  const other = await Warehouse.create({
    userId: otherUser._id, nameAr: 'م2', nameEn: 'W2', address: 'r', city: 'Latakia', phone: '0942000902', isActive: true,
  });
  const catalog = await ProductCatalog.create({ nameAr: 'دواء الغير', manufacturerAr: 'شركة الصور' });
  const foreign = await Product.create({ warehouseId: other._id, masterProductId: catalog._id, categoryId: ids.category, price: 1 });
  const res = await call('POST', `/warehouse/products/${foreign._id}/image`, { file: PNG });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(uploaded.length, 0);
});

test('admin sets and clears the catalog central image', async () => {
  const { catalog } = await makeProduct();
  let res = await call('POST', `/admin/catalog/${catalog._id}/image`, { token: tokens.admin, file: PNG });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const url = uploaded[0];
  assert.strictEqual((await ProductCatalog.findById(catalog._id).lean()).imageUrl, url);

  res = await call('DELETE', `/admin/catalog/${catalog._id}/image`, { token: tokens.admin });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await ProductCatalog.findById(catalog._id).lean()).imageUrl, null);
  assert.deepStrictEqual(deleted, [url]);
});

test('admin uploads a manufacturer logo; it appears in the list', async () => {
  const manufacturer = await Manufacturer.findOne({ key: { $exists: true } }).lean();
  const res = await call('POST', `/admin/manufacturers/${manufacturer._id}/logo`, { token: tokens.admin, file: PNG });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.manufacturer.logoUrl, uploaded[0]);
});

test('image uploads are role-gated', async () => {
  const { catalog, product } = await makeProduct();
  assert.strictEqual((await call('POST', `/admin/catalog/${catalog._id}/image`, { token: tokens.warehouse, file: PNG })).status, 403);
  assert.strictEqual((await call('POST', `/warehouse/products/${product._id}/image`, { token: tokens.pharmacy, file: PNG })).status, 403);
  assert.strictEqual((await call('POST', `/warehouse/products/${product._id}/image`, { token: null, file: PNG })).status, 401);
  assert.strictEqual(uploaded.length, 0);
});
