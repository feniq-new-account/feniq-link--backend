// The admin's Categories screen (/admin/categories): every category with its
// catalog item and warehouse product counts, renaming (items stay filed under
// it - they point at it by id), and merging category A into B (every catalog
// item and warehouse product moves to B and A is deleted, in one transaction,
// after a confirmation step that says how many items move). Categories the
// catalog import creates are ordinary categories here.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-admin-categories-tests-000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const catalogService = require('../src/services/productCatalog.service');
const { normalizeText } = require('../src/utils/normalizeText');

let server;
let baseUrl;
let adminToken;
let warehouse;

async function api(method, path, body) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

let seq = 0;
async function category(nameAr, nameEn = nameAr) {
  return Category.create({ nameAr, nameEn });
}
async function catalogItem(categoryId) {
  seq += 1;
  return ProductCatalog.create({ nameAr: `صنف الفئات ${seq}`, manufacturerAr: 'مصنع الفئات', categoryId });
}
async function warehouseProduct(item) {
  return Product.create({ warehouseId: warehouse._id, masterProductId: item._id, categoryId: item.categoryId, price: 5 });
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-admin-categories-test' });
  await syncIndexes(Category, ProductCatalog, Product, Manufacturer);
  const [admin, warehouseUser] = await User.create([
    { name: 'AD', phone: '0952003301', role: 'admin', status: 'active' },
    { name: 'WH', phone: '0942003301', role: 'warehouse', status: 'active' },
  ]);
  adminToken = jwt.sign({ sub: String(admin._id) }, env.jwtSecret, { expiresIn: '1h' });
  warehouse = await Warehouse.create({
    userId: warehouseUser._id,
    nameAr: 'مستودع الفئات',
    nameEn: 'Categories warehouse',
    address: 'r',
    city: 'Latakia',
    phone: '0942003301',
    isActive: true,
  });
  await Manufacturer.create({ nameAr: 'مصنع الفئات', key: normalizeText('مصنع الفئات') });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test.beforeEach(async () => {
  await Promise.all([Category.deleteMany({}), ProductCatalog.deleteMany({}), Product.deleteMany({})]);
});

// --- list --------------------------------------------------------------------------

test('the list gives every category its catalog item and warehouse product counts', async () => {
  const full = await category('مسكنات', 'Painkillers');
  const empty = await category('فئة فارغة', 'Empty');
  const a = await catalogItem(full._id);
  await catalogItem(full._id);
  await warehouseProduct(a);

  const { status, body } = await api('GET', '/admin/categories');
  assert.strictEqual(status, 200);
  const byId = new Map(body.categories.map((c) => [String(c.id), c]));
  assert.deepStrictEqual(
    [byId.get(String(full._id)).catalogItemCount, byId.get(String(full._id)).productCount],
    [2, 1]
  );
  assert.deepStrictEqual(
    [byId.get(String(empty._id)).catalogItemCount, byId.get(String(empty._id)).productCount],
    [0, 0]
  );
});

// --- rename ------------------------------------------------------------------------

test('renaming a category keeps every catalog item and warehouse product filed under it', async () => {
  const c = await category('مكملات غذائيه');
  const item = await catalogItem(c._id);
  const product = await warehouseProduct(item);

  const { status, body } = await api('PATCH', `/admin/categories/${c._id}`, {
    nameAr: '  مكملات غذائية ',
    nameEn: 'Supplements',
  });
  assert.strictEqual(status, 200, JSON.stringify(body));
  assert.strictEqual(body.category.nameAr, 'مكملات غذائية');
  assert.strictEqual(body.category.nameEn, 'Supplements');

  const saved = await Category.findById(c._id).lean();
  assert.deepStrictEqual([saved.nameAr, saved.nameEn], ['مكملات غذائية', 'Supplements']);
  assert.strictEqual(String((await ProductCatalog.findById(item._id).lean()).categoryId), String(c._id));
  assert.strictEqual(String((await Product.findById(product._id).lean()).categoryId), String(c._id));
  assert.strictEqual(await Category.countDocuments(), 1);
});

test('a rename to another category\'s name (after normalizeText) is refused - merge them instead', async () => {
  const taken = await category('صادات حيوية', 'Antibiotics');
  const c = await category('فئة أخرى', 'Other');
  for (const changes of [{ nameAr: 'صادات حيويه' }, { nameEn: ' ANTIBIOTICS ' }, { nameAr: 'antibiotics' }]) {
    const { status, body } = await api('PATCH', `/admin/categories/${c._id}`, changes);
    assert.strictEqual(status, 409, JSON.stringify(changes));
    assert.strictEqual(body.code, 'CATEGORY_ALREADY_EXISTS');
    assert.strictEqual(String(body.details.categoryId), String(taken._id));
  }
  assert.strictEqual((await Category.findById(c._id).lean()).nameAr, 'فئة أخرى');
});

test('a rename may change only its own spelling; an empty name is refused', async () => {
  const c = await category('صادات حيويه', 'Antibiotics');
  assert.strictEqual((await api('PATCH', `/admin/categories/${c._id}`, { nameAr: 'صادات حيوية' })).status, 200);
  const empty = await api('PATCH', `/admin/categories/${c._id}`, { nameEn: '   ' });
  assert.strictEqual(empty.status, 400);
  assert.strictEqual(empty.body.code, 'INVALID_CATEGORY_NAME');
  assert.strictEqual((await api('PATCH', `/admin/categories/${new mongoose.Types.ObjectId()}`, { nameAr: 'س' })).status, 404);
});

test('a category the import created can be renamed; the next import files items under it by its new name, not a new category', async () => {
  const xlsx = async (rows) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    rows.forEach((row) => sheet.addRow(row));
    return { buffer: await workbook.xlsx.writeBuffer(), originalname: 'c.xlsx' };
  };
  const report = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'الفئة'],
    ['صنف فئة مستوردة', 'مصنع الفئات', 'Vitamins'],
  ]));
  const created = report.newCategories[0];
  assert.strictEqual((await api('PATCH', `/admin/categories/${created.id}`, { nameAr: 'فيتامينات' })).status, 200);

  const next = await catalogService.importFromExcel(await xlsx([
    ['اسم المادة', 'الشركة', 'الفئة'],
    ['صنف فئة مستوردة ثان', 'مصنع الفئات', 'فيتامينات'],
    ['صنف فئة مستوردة ثالث', 'مصنع الفئات', 'VITAMINS'], // still its English name
  ]));
  assert.deepStrictEqual(next.newCategories, []);
  assert.strictEqual(await Category.countDocuments(), 1);
  assert.strictEqual(await ProductCatalog.countDocuments({ categoryId: created.id }), 3);
});

// --- merge -------------------------------------------------------------------------

test('merge: the first call says how many items move and changes nothing', async () => {
  const target = await category('مسكنات', 'Painkillers');
  const source = await category('مسكنات الألم', 'Pain relief');
  const a = await catalogItem(source._id);
  await catalogItem(source._id);
  await warehouseProduct(a);

  const { status, body } = await api('POST', `/admin/categories/${target._id}/merge`, { sourceId: String(source._id) });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.code, 'CATEGORY_MERGE_NEEDS_CONFIRMATION');
  assert.strictEqual(body.details.catalogItemCount, 2);
  assert.strictEqual(body.details.productCount, 1);
  assert.strictEqual(body.details.source.nameAr, 'مسكنات الألم');
  assert.strictEqual(body.details.target.nameAr, 'مسكنات');
  // `confirmed` must be exactly true.
  const loose = await api('POST', `/admin/categories/${target._id}/merge`, { sourceId: String(source._id), confirmed: 'true' });
  assert.strictEqual(loose.body.code, 'CATEGORY_MERGE_NEEDS_CONFIRMATION');

  assert.ok(await Category.exists({ _id: source._id }));
  assert.strictEqual(await ProductCatalog.countDocuments({ categoryId: source._id }), 2);
});

test('merge: confirmed, every catalog item and warehouse product moves to the target and the source is deleted', async () => {
  const target = await category('مسكنات', 'Painkillers');
  const source = await category('مسكنات الألم', 'Pain relief');
  const bystander = await category('فيتامينات', 'Vitamins');
  const alreadyThere = await catalogItem(target._id);
  const moving = [await catalogItem(source._id), await catalogItem(source._id)];
  const movingProducts = [await warehouseProduct(moving[0]), await warehouseProduct(moving[1])];
  const untouched = await warehouseProduct(await catalogItem(bystander._id));

  const { status, body } = await api('POST', `/admin/categories/${target._id}/merge`, {
    sourceId: String(source._id),
    confirmed: true,
  });
  assert.strictEqual(status, 200, JSON.stringify(body));
  assert.deepStrictEqual(body.moved, { catalogItems: 2, products: 2 });
  assert.strictEqual(String(body.category.id), String(target._id));

  assert.strictEqual(await Category.exists({ _id: source._id }), null);
  for (const item of [alreadyThere, ...moving]) {
    assert.strictEqual(String((await ProductCatalog.findById(item._id).lean()).categoryId), String(target._id));
  }
  for (const product of movingProducts) {
    assert.strictEqual(String((await Product.findById(product._id).lean()).categoryId), String(target._id));
  }
  assert.strictEqual(String((await Product.findById(untouched._id).lean()).categoryId), String(bystander._id));
  assert.strictEqual(await ProductCatalog.countDocuments({ categoryId: source._id }), 0);
  assert.strictEqual(await Product.countDocuments({ categoryId: source._id }), 0);

  // The list now shows the target holding them all.
  const list = await api('GET', '/admin/categories');
  const merged = list.body.categories.find((c) => String(c.id) === String(target._id));
  assert.deepStrictEqual([merged.catalogItemCount, merged.productCount], [3, 2]);
  assert.strictEqual(list.body.categories.length, 2);
});

test('merge: into itself, with no source, or with an unknown category is refused', async () => {
  const target = await category('مسكنات', 'Painkillers');
  const self = await api('POST', `/admin/categories/${target._id}/merge`, { sourceId: String(target._id), confirmed: true });
  assert.strictEqual(self.status, 400);
  assert.strictEqual(self.body.code, 'INVALID_MERGE');
  const none = await api('POST', `/admin/categories/${target._id}/merge`, { confirmed: true });
  assert.strictEqual(none.body.code, 'INVALID_MERGE');
  const unknown = await api('POST', `/admin/categories/${target._id}/merge`, {
    sourceId: String(new mongoose.Types.ObjectId()),
    confirmed: true,
  });
  assert.strictEqual(unknown.status, 404);
  assert.strictEqual(unknown.body.code, 'CATEGORY_NOT_FOUND');
  const unknownTarget = await api('POST', `/admin/categories/${new mongoose.Types.ObjectId()}/merge`, {
    sourceId: String(target._id),
    confirmed: true,
  });
  assert.strictEqual(unknownTarget.status, 404);
  assert.ok(await Category.exists({ _id: target._id }));
});
