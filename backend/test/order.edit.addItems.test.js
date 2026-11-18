// A warehouse adding a product to an order it is correcting (the phone's
// "add an item", Phase D): the added line is priced at the ORDER's captured
// rate, a recalled product is refused, and a product is never added twice -
// which also makes a resent save after a timeout harmless.
//
// Own database, dropped at the end - same pattern as order.edit.test.js.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-order-add-items';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const orderService = require('../src/services/order.service');
const warehouseOrders = require('../src/services/warehouseOrder.service');

const ids = {};

test.before(async () => {
  await startMemoryMongo({ dbName: 'order-edit-add-items' });
  await syncIndexes(Order);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });
  const [warehouseUser, pharmacyUser] = await User.create([
    { name: 'WH', phone: '0942000911', role: 'warehouse', status: 'active' },
    { name: 'PH', phone: '0932000911', role: 'pharmacy', status: 'active' },
  ]);
  ids.user = warehouseUser._id;
  const warehouse = await Warehouse.create({
    userId: warehouseUser._id, nameAr: 'م', nameEn: 'W', address: 'r', city: 'Latakia',
    phone: '0942000911', deliveryType: 'self', requireDeliverySealPhoto: false, isActive: true,
    discountRate: 0, commissionRate: 0,
  });
  ids.warehouse = warehouse._id;
  const pharmacy = await Pharmacy.create({
    userId: pharmacyUser._id, nameAr: 'ص', nameEn: 'P', ownerName: 'O', address: 'a',
    city: 'Latakia', areaType: 'city', phone: '0932000911', addedBy: 'self',
  });
  ids.pharmacy = pharmacy._id;
  for (const name of ['A', 'B']) {
    const product = await Product.create({
      warehouseId: warehouse._id, nameAr: name, nameEn: name, manufacturerAr: 'ش', price: 2,
      unitAr: 'ع', unitEn: 'b', isAvailable: true, isActive: true,
    });
    ids[name] = product._id.toString();
  }
});

test.after(stopMemoryMongo);

const place = () =>
  orderService.createOrder({
    userId: ids.user, pharmacyId: ids.pharmacy, warehouseId: ids.warehouse,
    items: [{ productId: ids.A, quantity: 10 }], notes: null, packages: [],
  });

const edit = (order, payload) =>
  warehouseOrders.updateOrderItems(order._id.toString(), ids.warehouse, ids.user, payload);

const linesOf = (order) => OrderItem.find({ orderId: order._id }).lean();

test('an added line is priced at the order\'s own rate, not today\'s', async () => {
  const order = await place();
  await ExchangeRate.updateOne({ _id: 'singleton' }, { usdToSyp: 14000 });
  try {
    await edit(order, { addItems: [{ productId: ids.B, quantity: 10 }] });
  } finally {
    await ExchangeRate.updateOne({ _id: 'singleton' }, { usdToSyp: 10000 });
  }
  const saved = await Order.findById(order._id).lean();
  const added = (await linesOf(order)).find((line) => line.productId.toString() === ids.B);
  assert.strictEqual(saved.fx.rate, 10000);
  assert.strictEqual(added.unitPrice, 20000);
  assert.strictEqual(saved.finalPrice, 400000);
  assert.strictEqual(saved.finalAmountUsd, 40);
});

test('a recalled product (inactive, still marked available) is refused', async () => {
  const order = await place();
  await Product.updateOne({ _id: ids.B }, { $set: { isActive: false } });
  try {
    await assert.rejects(
      edit(order, { addItems: [{ productId: ids.B, quantity: 2 }] }),
      (err) => err.code === 'PRODUCT_UNAVAILABLE' && err.details?.productId === ids.B
    );
  } finally {
    await Product.updateOne({ _id: ids.B }, { $set: { isActive: true } });
  }
  assert.strictEqual((await Order.findById(order._id).lean()).finalPrice, 200000);
  assert.strictEqual((await linesOf(order)).length, 1);
});

test('the same product twice in one request is refused', async () => {
  const order = await place();
  await assert.rejects(
    edit(order, { addItems: [{ productId: ids.B, quantity: 1 }, { productId: ids.B, quantity: 1 }] }),
    (err) => err.statusCode === 409 && err.code === 'PRODUCT_ALREADY_ON_ORDER'
  );
  assert.strictEqual((await linesOf(order)).length, 1);
});

test('a product already a line is refused, unless that line is being dropped', async () => {
  const order = await place();
  await assert.rejects(
    edit(order, { addItems: [{ productId: ids.A, quantity: 5 }] }),
    (err) => err.code === 'PRODUCT_ALREADY_ON_ORDER'
  );
  const [lineA] = await linesOf(order);
  await edit(order, {
    removeItems: [lineA._id.toString()],
    addItems: [{ productId: ids.A, quantity: 5 }],
  });
  const lines = await linesOf(order);
  assert.deepStrictEqual(lines.map((line) => line.quantity), [5]);
});

test('a save sent again (timeout, double tap) adds the product once', async () => {
  const order = await place();
  const body = { addItems: [{ productId: ids.B, quantity: 3 }] };
  const results = await Promise.allSettled([edit(order, body), edit(order, body)]);
  await edit(order, body).catch(() => {});
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  const added = (await linesOf(order)).filter((line) => line.productId.toString() === ids.B);
  assert.strictEqual(added.length, 1);
  assert.strictEqual(added[0].quantity, 3);
});
