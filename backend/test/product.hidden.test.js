// A warehouse can take a product off its catalog ("hide") rather than only
// mark it unavailable: pharmacists then never see it - catalog, search,
// companies, alternatives here and at other warehouses, offers - and can't
// order it, while the warehouse keeps it in its own list to show again.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-product-hidden-tests';
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
const Offer = require('../src/models/offer.model');
const Category = require('../src/models/category.model');
const productService = require('../src/services/product.service');
const warehouseProductService = require('../src/services/warehouseProduct.service');
const warehouseProductViewModel = require('../src/viewmodels/warehouseProduct.viewmodel');
const offerService = require('../src/services/offer.service');

const HOME = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();

let items;
let products;
let ownerId;
let categoryId;

const names = (rows) => rows.map(({ product }) => product.nameAr).sort();

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-product-hidden-test' });
  await syncIndexes(ProductCatalog, Manufacturer, Product);
  const [homeOwner, otherOwner] = await User.create([
    { name: 'WH1', phone: '0900000301', role: 'warehouse', status: 'active' },
    { name: 'WH2', phone: '0900000302', role: 'warehouse', status: 'active' },
  ]);
  ownerId = homeOwner._id;
  categoryId = (await Category.create({ nameAr: 'مسكنات', nameEn: 'Painkillers' }))._id.toString();
  await Warehouse.create([
    { _id: HOME, userId: homeOwner._id, nameAr: 'م1', nameEn: 'Home', address: 'a', city: 'Latakia', phone: '0900000301', isActive: true },
    { _id: OTHER, userId: otherOwner._id, nameAr: 'م2', nameEn: 'Other', address: 'a', city: 'Latakia', phone: '0900000302', isActive: true },
  ]);

  const para = { activeIngredient: 'PARACETAMOL', dosageForm: 'أقراص', strength: '500 MG/TAB.' };
  items = {
    panadol: await ProductCatalog.create({ nameAr: 'PANADOL 500', manufacturerAr: 'جي إس كيه', ...para }),
    cetamol: await ProductCatalog.create({ nameAr: 'CETAMOL 500', manufacturerAr: 'ابن حيان', ...para }),
    adol: await ProductCatalog.create({ nameAr: 'ADOL 500', manufacturerAr: 'جلفار', ...para }),
  };
  const stock = (warehouseId, item, extra = {}) =>
    Product.create({ warehouseId, masterProductId: item._id, price: 2, isActive: true, isAvailable: true, ...extra });
  products = {
    panadol: await stock(HOME, items.panadol),
    cetamolHidden: await stock(HOME, items.cetamol, { hiddenByWarehouse: true }),
    adolUnavailable: await stock(HOME, items.adol, { isAvailable: false, manuallyDisabled: true }),
    otherPanadolHidden: await stock(OTHER, items.panadol, { hiddenByWarehouse: true }),
    otherCetamol: await stock(OTHER, items.cetamol),
  };
});

test.after(async () => {
  await stopMemoryMongo();
});

test("the pharmacist's catalog and search leave a hidden product out; an unavailable one stays, greyed", async () => {
  const { items: listed } = await productService.listWarehouseProducts(HOME, { limit: 50 });
  assert.deepStrictEqual(names(listed), ['ADOL 500', 'PANADOL 500']);
  const { items: searched } = await productService.listWarehouseProducts(HOME, { search: 'cetamol 500', limit: 50 });
  assert.deepStrictEqual(names(searched), []);
});

test("a company whose only product is hidden drops off the pharmacist's company list", async () => {
  const companies = await productService.listManufacturersWithDiscountsForWarehouse(HOME);
  const shown = companies.map((c) => c.manufacturerAr ?? c.name).sort();
  assert.ok(!shown.includes('ابن حيان'), JSON.stringify(shown));
  assert.ok(shown.includes('جي إس كيه'), JSON.stringify(shown));
});

test('alternatives - here and at other warehouses - leave hidden products out', async () => {
  const here = await productService.listAlternatives(HOME, products.panadol._id);
  assert.deepStrictEqual(names(here), ['ADOL 500']);
  const elsewhere = await productService.listAlternativesElsewhere(HOME, products.panadol._id);
  assert.deepStrictEqual(elsewhere.map((e) => `${e.warehouse.nameEn}: ${e.product.nameAr}`), ['Other: CETAMOL 500']);
});

test("a hidden product's live offer is not shown to pharmacists", async () => {
  const offer = await Offer.create({
    warehouseId: HOME,
    productId: products.cetamolHidden._id,
    titleAr: 'عرض',
    titleEn: 'Offer',
    discountPercentage: 10,
    status: 'approved',
    startDate: new Date(Date.now() - 86400000),
    endDate: new Date(Date.now() + 86400000),
    isPermanent: false,
  });
  const { rows } = await offerService.listActiveOffers();
  assert.ok(!rows.some((row) => row.offer._id.equals(offer._id)));
  await Offer.deleteOne({ _id: offer._id });
});

test("the warehouse's own list still has it, marked hidden", async () => {
  const { rows } = await warehouseProductService.listPaginatedProductsForWarehouse(HOME, { limit: 50 });
  const hidden = rows.find((p) => p._id.equals(products.cetamolHidden._id));
  assert.ok(hidden, 'listed for the warehouse');
  const serialized = warehouseProductViewModel.toProductResponse(hidden).product;
  assert.strictEqual(serialized.hiddenByWarehouse, true);
});

test('the warehouse hides a product and shows it again', async () => {
  const hidden = await warehouseProductService.updateProduct(products.panadol._id, HOME, ownerId, { hiddenByWarehouse: true });
  assert.strictEqual(hidden.hiddenByWarehouse, true);
  let { items: listed } = await productService.listWarehouseProducts(HOME, { limit: 50 });
  assert.ok(!names(listed).includes('PANADOL 500'));

  const shown = await warehouseProductService.updateProduct(products.panadol._id, HOME, ownerId, { hiddenByWarehouse: false });
  assert.strictEqual(shown.hiddenByWarehouse, false);
  ({ items: listed } = await productService.listWarehouseProducts(HOME, { limit: 50 }));
  assert.ok(names(listed).includes('PANADOL 500'));
});

test('adding a medicine the warehouse had hidden brings it back, with the new price', async () => {
  const product = await warehouseProductService.createProduct(HOME, {
    masterProductId: items.cetamol._id.toString(),
    categoryId,
    priceUsd: 3,
    unit: 'box',
  }, { userId: ownerId });
  assert.ok(product._id.equals(products.cetamolHidden._id), 'the same product, not a second one');
  assert.strictEqual(product.hiddenByWarehouse, false);
  assert.strictEqual(product.price, 3);
  const { items: listed } = await productService.listWarehouseProducts(HOME, { limit: 50 });
  assert.ok(names(listed).includes('CETAMOL 500'));
});
