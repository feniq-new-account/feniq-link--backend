// Active ingredient on the catalog (import, search) and the pharmacist's
// alternatives: same ingredient + strength + form, in the same warehouse.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-alternatives-tests';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const Warehouse = require('../src/models/warehouse.model');
const User = require('../src/models/user.model');
const productService = require('../src/services/product.service');
const catalogService = require('../src/services/productCatalog.service');
const { normalizeText } = require('../src/utils/normalizeText');

const WAREHOUSE_ID = new mongoose.Types.ObjectId();
const OTHER_WAREHOUSE_ID = new mongoose.Types.ObjectId();

async function xlsx(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  rows.forEach((row) => sheet.addRow(row));
  return { buffer: await workbook.xlsx.writeBuffer(), originalname: 'catalog.xlsx' };
}

const make = (nameAr, extra = {}) =>
  ProductCatalog.create({ nameAr, manufacturerAr: 'شركة الاختبار', ...extra });
const stock = (item, price, extra = {}) =>
  Product.create({ warehouseId: WAREHOUSE_ID, masterProductId: item._id, price, isActive: true, isAvailable: true, ...extra });

let items;
let products;

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-alternatives-test' });
  await syncIndexes(ProductCatalog, Manufacturer, Product);
  const owner = await User.create({ name: 'WH', phone: '0900000077', role: 'warehouse', status: 'active' });
  await Warehouse.create([
    { _id: WAREHOUSE_ID, userId: owner._id, nameAr: 'م', nameEn: 'W', address: 'a', city: 'Latakia', phone: '0900000077', isActive: true },
    { _id: OTHER_WAREHOUSE_ID, userId: new mongoose.Types.ObjectId(), nameAr: 'م2', nameEn: 'W2', address: 'a', city: 'Latakia', phone: '0900000078', isActive: true },
  ]);

  const para = { activeIngredient: 'PARACETAMOL', dosageForm: 'أقراص' };
  items = {
    panadol: await make('PANADOL 500 TAB.', { ...para, strength: '500 MG/TAB.' }),
    // The same medicine under another brand, written as a coated tablet.
    cetamol: await make('CETAMOL 500 CTD TAB.', { activeIngredient: 'PARACETAMOL', dosageForm: 'أقراص ملبسة', strength: '500 MG/CTD TAB.' }),
    cheap: await make('PARACETAMOL CHEAP 500', { ...para, strength: '500 MG/TAB.' }),
    outOfStock: await make('PARAMOL 500', { ...para, strength: '500 MG/TAB.' }),
    notStocked: await make('PARADOL 500', { ...para, strength: '500 MG/TAB.' }),
    otherStrength: await make('PANADOL 1000', { ...para, strength: '1000 MG/TAB.' }),
    otherForm: await make('PANADOL SYRUP', { activeIngredient: 'PARACETAMOL', dosageForm: 'شراب', strength: '500 MG/TAB.' }),
    otherDrug: await make('BRUFEN 500', { activeIngredient: 'IBUPROFEN', dosageForm: 'أقراص', strength: '500 MG/TAB.' }),
    withdrawn: await make('PARAWITHDRAWN 500', { ...para, strength: '500 MG/TAB.', isActive: false }),
    noData: await make('MYSTERY'),
  };
  products = {
    panadol: await stock(items.panadol, 5),
    cetamol: await stock(items.cetamol, 4),
    cheap: await stock(items.cheap, 3),
    outOfStock: await stock(items.outOfStock, 1, { isAvailable: false, manuallyDisabled: true }),
    otherStrength: await stock(items.otherStrength, 6),
    otherForm: await stock(items.otherForm, 6),
    otherDrug: await stock(items.otherDrug, 6),
    noData: await stock(items.noData, 6),
  };
  // Stocked, but by a different warehouse only.
  await Product.create({ warehouseId: OTHER_WAREHOUSE_ID, masterProductId: items.notStocked._id, price: 2, isActive: true, isAvailable: true });
});

test.after(async () => {
  await stopMemoryMongo();
});

test('the catalog derives its matching keys from the ingredient, strength and form', () => {
  const { panadol, cetamol } = items;
  assert.strictEqual(panadol.activeIngredientKey, 'paracetamol');
  assert.strictEqual(panadol.strengthKey, '500mg');
  assert.strictEqual(cetamol.strengthKey, '500mg');
  assert.strictEqual(panadol.formKey, cetamol.formKey);
  assert.strictEqual(items.noData.activeIngredientKey, null);
});

test('alternatives: same ingredient + strength + form in this warehouse, available first then cheapest', async () => {
  const result = await productService.listAlternatives(WAREHOUSE_ID, products.panadol._id);
  const names = result.map(({ product }) => product.nameAr);
  assert.deepStrictEqual(names, ['PARACETAMOL CHEAP 500', 'CETAMOL 500 CTD TAB.', 'PARAMOL 500']);
  assert.strictEqual(result[0].product.activeIngredient, 'PARACETAMOL');
});

test('alternatives never include the medicine itself, other strengths or forms, other drugs, withdrawn items or other warehouses', async () => {
  const result = await productService.listAlternatives(WAREHOUSE_ID, products.panadol._id);
  const names = new Set(result.map(({ product }) => product.nameAr));
  for (const excluded of ['PANADOL 500 TAB.', 'PANADOL 1000', 'PANADOL SYRUP', 'BRUFEN 500', 'PARAWITHDRAWN 500', 'PARADOL 500']) {
    assert.ok(!names.has(excluded), excluded);
  }
});

test('alternatives: a medicine with no ingredient data, or no match, has none', async () => {
  assert.deepStrictEqual(await productService.listAlternatives(WAREHOUSE_ID, products.noData._id), []);
  assert.deepStrictEqual(await productService.listAlternatives(WAREHOUSE_ID, products.otherDrug._id), []);
});

test('alternatives: a product of another warehouse is not found', async () => {
  await assert.rejects(productService.listAlternatives(OTHER_WAREHOUSE_ID, products.panadol._id), { statusCode: 404 });
});

test("the pharmacist's search finds a medicine by its active ingredient", async () => {
  const { items: found } = await productService.listWarehouseProducts(WAREHOUSE_ID, { search: 'paracetamol', limit: 50 });
  const names = found.map(({ product }) => product.nameAr).sort();
  assert.deepStrictEqual(names, ['CETAMOL 500 CTD TAB.', 'PANADOL 1000', 'PANADOL 500 TAB.', 'PANADOL SYRUP', 'PARACETAMOL CHEAP 500', 'PARAMOL 500']);
  const { items: byName } = await productService.listWarehouseProducts(WAREHOUSE_ID, { search: 'brufen', limit: 50 });
  assert.deepStrictEqual(byName.map(({ product }) => product.nameAr), ['BRUFEN 500']);
});

test('the admin catalog list and the warehouse type-ahead search the ingredient too', async () => {
  const { items: listed } = await catalogService.listCatalog({ search: 'ibuprofen' });
  assert.deepStrictEqual(listed.map((item) => item.nameAr), ['BRUFEN 500']);
  const typeahead = await catalogService.searchActiveForWarehouse('ibuprofen');
  assert.deepStrictEqual(typeahead.map((item) => item.nameAr), ['BRUFEN 500']);
});

test('the catalog import reads ingredient, strength and form (even under the Ministry headers) and backfills them on a re-import', async () => {
  const company = 'مصنع الاستيراد';
  await Manufacturer.create({ nameAr: company, key: normalizeText(company) });
  const first = await catalogService.importFromExcel(await xlsx([
    ['اسم الدواء', 'الشركة'],
    ['ALPHA GLIP (30 TAB)', company],
  ]));
  assert.strictEqual(first.added, 1);
  let item = await ProductCatalog.findOne({ nameAr: 'ALPHA GLIP (30 TAB)' }).lean();
  assert.strictEqual(item.activeIngredient, null);

  const second = await catalogService.importFromExcel(await xlsx([
    ['اسم الدواء', 'الشركة', 'التركيب', 'العيار', 'الشكل الصيدلاني'],
    ['ALPHA GLIP (30 TAB)', company, 'SITAGLIPTIN', '100 MG/CTD TAB.', 'أقراص ملبسة'],
    ['NEW ONE (10 TAB)', company, 'SITAGLIPTIN', '100 MG/TAB.', 'أقراص'],
  ]));
  assert.strictEqual(second.updated, 1);
  assert.strictEqual(second.added, 1);
  item = await ProductCatalog.findOne({ nameAr: 'ALPHA GLIP (30 TAB)' }).lean();
  assert.deepStrictEqual(
    [item.activeIngredient, item.strength, item.dosageForm, item.activeIngredientKey, item.strengthKey, item.formKey],
    ['SITAGLIPTIN', '100 MG/CTD TAB.', 'أقراص ملبسة', 'sitagliptin', '100mg', 'tablet']
  );
  const added = await ProductCatalog.findOne({ nameAr: 'NEW ONE (10 TAB)' }).lean();
  assert.strictEqual(added.strengthKey, item.strengthKey);
  assert.strictEqual(added.formKey, item.formKey);

  // A third file without those columns must not blank what is there.
  const third = await catalogService.importFromExcel(await xlsx([['اسم الدواء', 'الشركة'], ['ALPHA GLIP (30 TAB)', company]]));
  assert.strictEqual(third.unchanged, 1);
  item = await ProductCatalog.findOne({ nameAr: 'ALPHA GLIP (30 TAB)' }).lean();
  assert.strictEqual(item.activeIngredient, 'SITAGLIPTIN');
});

test('the admin can set or clear the ingredient on an item', async () => {
  const item = await catalogService.updateCatalogItem(items.noData._id, { activeIngredient: ' CAFFEINE ', strength: '50 MG/TAB.', dosageForm: 'أقراص' });
  assert.strictEqual(item.activeIngredientKey, 'caffeine');
  const cleared = await catalogService.updateCatalogItem(items.noData._id, { activeIngredient: null });
  assert.strictEqual(cleared.activeIngredient, null);
  assert.strictEqual(cleared.activeIngredientKey, null);
  await assert.rejects(catalogService.updateCatalogItem(items.noData._id, { strength: 5 }), { statusCode: 400 });
});
