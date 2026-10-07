// The same medicine and its alternatives at the OTHER warehouses: what the
// pharmacist is offered when this warehouse has it out of stock or has nothing
// to stand in for it.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-alternatives-elsewhere-tests';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const Warehouse = require('../src/models/warehouse.model');
const User = require('../src/models/user.model');
const productService = require('../src/services/product.service');
const productViewModel = require('../src/viewmodels/product.viewmodel');

const HOME = new mongoose.Types.ObjectId();
const NEAR = new mongoose.Types.ObjectId();
const FAR = new mongoose.Types.ObjectId();
const SUSPENDED = new mongoose.Types.ObjectId();
const CLOSED = new mongoose.Types.ObjectId();

const make = (nameAr, extra = {}) =>
  ProductCatalog.create({ nameAr, manufacturerAr: 'شركة الاختبار', ...extra });
const stock = (warehouseId, item, price, extra = {}) =>
  Product.create({ warehouseId, masterProductId: item._id, price, isActive: true, isAvailable: true, ...extra });

let items;
let homeProducts;

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-alternatives-elsewhere-test' });
  await syncIndexes(ProductCatalog, Manufacturer, Product);
  const owner = (phone, status = 'active') => User.create({ name: `WH ${phone}`, phone, role: 'warehouse', status });
  const [homeOwner, nearOwner, farOwner, suspendedOwner, closedOwner] = await Promise.all([
    owner('0900000101'),
    owner('0900000102'),
    owner('0900000103'),
    owner('0900000104', 'blocked'),
    owner('0900000105'),
  ]);
  const warehouse = (_id, userId, nameEn, extra = {}) => ({
    _id, userId, nameAr: `مستودع ${nameEn}`, nameEn, address: 'a', city: 'Latakia', phone: '0900000100', isActive: true, ...extra,
  });
  await Warehouse.create([
    warehouse(HOME, homeOwner._id, 'Home'),
    warehouse(NEAR, nearOwner._id, 'Near', { logo: 'https://res.cloudinary.com/demo/near.png' }),
    warehouse(FAR, farOwner._id, 'Far', { city: 'Damascus' }),
    warehouse(SUSPENDED, suspendedOwner._id, 'Suspended'),
    warehouse(CLOSED, closedOwner._id, 'Closed', { isActive: false }),
  ]);

  const para = { activeIngredient: 'PARACETAMOL', dosageForm: 'أقراص', strength: '500 MG/TAB.' };
  items = {
    panadol: await make('PANADOL 500 TAB.', para),
    cheap: await make('PARACETAMOL CHEAP 500', para),
    cetamol: await make('CETAMOL 500', para),
    otherStrength: await make('PANADOL 1000', { ...para, strength: '1000 MG/TAB.' }),
    noData: await make('MYSTERY'),
  };
  homeProducts = {
    // Out of stock here - the case the feature is for.
    panadol: await stock(HOME, items.panadol, 5, { isAvailable: false, manuallyDisabled: true }),
    noData: await stock(HOME, items.noData, 5),
  };
  await stock(NEAR, items.panadol, 6);
  await stock(NEAR, items.cheap, 3);
  await stock(NEAR, items.otherStrength, 1);
  await stock(FAR, items.panadol, 4);
  await stock(FAR, items.cetamol, 2, { isAvailable: false, manuallyDisabled: true });
  await stock(FAR, items.noData, 7);
  // Warehouses the pharmacist cannot order from.
  await stock(SUSPENDED, items.panadol, 1);
  await stock(CLOSED, items.cheap, 1);
  // Withdrawn by the platform.
  await stock(NEAR, items.cetamol, 1, { isActive: false });
});

test.after(async () => {
  await stopMemoryMongo();
});

const label = (entry) => `${entry.warehouse.nameEn}: ${entry.product.nameAr}`;

test('the same medicine first, then its alternatives, cheapest first, each with its warehouse', async () => {
  const result = await productService.listAlternativesElsewhere(HOME, homeProducts.panadol._id);
  assert.deepStrictEqual(result.map(label), [
    'Far: PANADOL 500 TAB.',
    'Near: PANADOL 500 TAB.',
    'Near: PARACETAMOL CHEAP 500',
  ]);
  assert.deepStrictEqual(result.map((e) => e.isSameMedicine), [true, true, false]);
});

test('never this warehouse, a suspended or closed one, an unavailable or withdrawn product, or another strength', async () => {
  const result = await productService.listAlternativesElsewhere(HOME, homeProducts.panadol._id);
  for (const entry of result) {
    assert.ok(![HOME, SUSPENDED, CLOSED].some((id) => id.equals(entry.warehouse._id)), label(entry));
    assert.ok(!['CETAMOL 500', 'PANADOL 1000'].includes(entry.product.nameAr), label(entry));
  }
});

test('a medicine with no ingredient data still finds itself at another warehouse', async () => {
  const result = await productService.listAlternativesElsewhere(HOME, homeProducts.noData._id);
  assert.deepStrictEqual(result.map(label), ['Far: MYSTERY']);
});

test("each warehouse's own offers and discounts price its products", async () => {
  const result = await productService.listAlternativesElsewhere(HOME, homeProducts.panadol._id);
  for (const entry of result) {
    assert.ok('offer' in entry && 'manufacturerDiscountPercentage' in entry, label(entry));
  }
});

test('the response: the catalog product shape plus the warehouse to go to', async () => {
  const result = await productService.listAlternativesElsewhere(HOME, homeProducts.panadol._id);
  const body = productViewModel.toElsewhereResponse(result, 13000);
  assert.strictEqual(body.priceRate, 13000);
  const near = body.alternatives.find((e) => e.warehouse.nameEn === 'Near' && e.isSameMedicine);
  assert.strictEqual(near.warehouse.id.toString(), NEAR.toString());
  assert.strictEqual(near.warehouse.nameAr, 'مستودع Near');
  assert.strictEqual(near.warehouse.logo, 'https://res.cloudinary.com/demo/near.png');
  assert.strictEqual(near.product.nameAr, 'PANADOL 500 TAB.');
  assert.strictEqual(near.product.activeIngredient, 'PARACETAMOL');
  assert.strictEqual(near.product.isAvailable, true);
  assert.strictEqual(near.product.finalPriceSyp, 78000);
});

test('a product of another warehouse, or an unavailable warehouse, is not found', async () => {
  await assert.rejects(productService.listAlternativesElsewhere(NEAR, homeProducts.panadol._id), { statusCode: 404 });
  await assert.rejects(productService.listAlternativesElsewhere(SUSPENDED, homeProducts.panadol._id), { statusCode: 404 });
});
