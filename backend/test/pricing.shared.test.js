// Catalog overhaul Phase 7 - one shared price function: decimal manufacturer
// discounts, the final price clamped at 0, and the lira price the catalog
// shows equal to the lira price the order charges.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-shared-pricing-tests-0000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Offer = require('../src/models/offer.model');
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const ExchangeRate = require('../src/models/exchangeRate.model');

const {
  computeFinalPrice,
  computeDiscountedPriceUsd,
  stackedDiscountSyp,
  createDiscount,
} = require('../src/services/manufacturerDiscount.service');
const { registerManufacturers } = require('../src/services/warehouseManufacturer.service');
const { listWarehouseProducts } = require('../src/services/product.service');
const productViewModel = require('../src/viewmodels/product.viewmodel');
const orderService = require('../src/services/order.service');

const RATE = 13130;
const ids = {};

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-shared-pricing-test' });
  await syncIndexes(Order, OrderItem);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: RATE, source: 'manual' });
  const [phUser, whUser] = await User.create([
    { name: 'Ph', phone: '0931001201', role: 'pharmacy', status: 'active' },
    { name: 'WH', phone: '0941001201', role: 'warehouse', status: 'active' },
  ]);
  ids.pharmacyUser = phUser._id;
  ids.pharmacy = (
    await Pharmacy.create({
      userId: phUser._id, nameAr: 'ص', nameEn: 'Pharmacy', ownerName: 'O',
      address: 'a', city: 'Latakia', areaType: 'city', phone: '0931001201', addedBy: 'self',
    })
  )._id;
  ids.warehouse = (
    await Warehouse.create({
      userId: whUser._id, nameAr: 'م', nameEn: 'Warehouse', address: 'r', city: 'Latakia',
      phone: '0941001201', deliveryType: 'self', isActive: true, discountRate: 0, commissionRate: 0,
    })
  )._id;
});

test.after(async () => {
  await stopMemoryMongo();
});

test('the final price is clamped at 0 and decimal discounts apply', () => {
  assert.strictEqual(computeDiscountedPriceUsd(10, 100, 50), 0);
  assert.strictEqual(stackedDiscountSyp(1000, 100, 100), 0);
  assert.strictEqual(computeDiscountedPriceUsd(100, null, 2.5), 97.5);
  const price = computeFinalPrice({ priceUsd: 2, offerDiscountPercentage: 10, manufacturerDiscountPercentage: 2.5, usdToSyp: 100 });
  // 200 SYP -> 180 after the offer -> 175.5 -> 176 after the manufacturer discount
  assert.deepStrictEqual(price, { finalUsd: 1.76, unitSyp: 200, finalSyp: 176 });
  assert.deepStrictEqual(computeFinalPrice({ priceUsd: 2 }), { finalUsd: 2, unitSyp: null, finalSyp: null });
});

test('the lira price the catalog shows is the lira price the order charges', async () => {
  const item = await ProductCatalog.create({ nameAr: 'دواء التسعير', manufacturerAr: 'شركة التسعير' });
  const product = await Product.create({ warehouseId: ids.warehouse, masterProductId: item._id, price: 1.37 });
  await Offer.create({
    warehouseId: ids.warehouse, productId: product._id, titleAr: 'ع', titleEn: 'o', discountPercentage: 15,
    startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), status: 'approved',
  });
  await registerManufacturers(ids.warehouse, ['شركة التسعير']);
  await createDiscount(ids.warehouse, { manufacturerAr: 'شركة التسعير', discountPercentage: 2.5 });

  const { items } = await listWarehouseProducts(ids.warehouse, {});
  const [shown] = productViewModel.toProductListResponse(items, RATE).products;
  assert.strictEqual(shown.priceRate, RATE);
  assert.strictEqual(shown.offerDiscountPercentage, 15);
  assert.strictEqual(shown.manufacturerDiscountPercentage, 2.5);
  // The naive conversion the app used to do differs from the charge here.
  assert.notStrictEqual(Math.round(shown.discountPriceUsd * RATE), shown.finalPriceSyp);

  const order = await orderService.createOrder({
    userId: ids.pharmacyUser,
    pharmacyId: ids.pharmacy,
    warehouseId: ids.warehouse,
    items: [{ productId: String(product._id), quantity: 3, displayedUnitPriceUsd: shown.discountPriceUsd }],
    notes: null,
    idempotencyKey: null,
    rateUsed: shown.priceRate,
  });
  const line = await OrderItem.findOne({ orderId: order._id ?? order.order?._id }).lean();
  assert.strictEqual(line.discountPrice, shown.finalPriceSyp);
});
