// Catalog overhaul Phase 8 - bonus on orders: the free quantity, frozen on
// the line and never charged; BONUS_CHANGED; old clients unaffected; a
// warehouse quantity edit recomputes from the frozen tiers.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-order-bonus-tests-000000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const Offer = require('../src/models/offer.model');
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const ExchangeRate = require('../src/models/exchangeRate.model');

const orderService = require('../src/services/order.service');
const warehouseOrderService = require('../src/services/warehouseOrder.service');

const RATE = 100;
const ids = {};

async function product(bonuses, price = 2) {
  return Product.create({
    warehouseId: ids.warehouse,
    nameAr: `دواء ${Math.random()}`,
    nameEn: 'Drug',
    manufacturerAr: 'شركة',
    price,
    unitAr: 'علبة',
    unitEn: 'box',
    bonuses,
    isAvailable: true,
    isActive: true,
  });
}

async function order(lines) {
  const result = await orderService.createOrder({
    userId: ids.pharmacyUser,
    pharmacyId: ids.pharmacy,
    warehouseId: ids.warehouse,
    items: lines,
    notes: null,
    idempotencyKey: null,
    rateUsed: RATE,
  });
  return result._id ?? result.order?._id;
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-order-bonus-test' });
  await syncIndexes(Order, OrderItem);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: RATE, source: 'manual' });
  const [phUser, whUser] = await User.create([
    { name: 'Ph', phone: '0931001301', role: 'pharmacy', status: 'active' },
    { name: 'WH', phone: '0941001301', role: 'warehouse', status: 'active' },
  ]);
  ids.pharmacyUser = phUser._id;
  ids.warehouseUser = whUser._id;
  ids.pharmacy = (
    await Pharmacy.create({
      userId: phUser._id, nameAr: 'ص', nameEn: 'Pharmacy', ownerName: 'O',
      address: 'a', city: 'Latakia', areaType: 'city', phone: '0931001301', addedBy: 'self',
    })
  )._id;
  ids.warehouse = (
    await Warehouse.create({
      userId: whUser._id, nameAr: 'م', nameEn: 'Warehouse', address: 'r', city: 'Latakia',
      phone: '0941001301', deliveryType: 'self', isActive: true, discountRate: 0, commissionRate: 0,
    })
  )._id;
});

test.after(async () => {
  await stopMemoryMongo();
});

test('10+1 and 25 units -> 2 free, and the free units are not charged', async () => {
  const p = await product([{ buy: 10, free: 1 }]);
  const orderId = await order([{ productId: String(p._id), quantity: 25 }]);
  const line = await OrderItem.findOne({ orderId }).lean();
  assert.strictEqual(line.quantity, 25);
  assert.strictEqual(line.freeQuantity, 2);
  assert.deepStrictEqual(line.bonusApplied, { buy: 10, free: 1 });
  const stored = await Order.findById(orderId).lean();
  assert.strictEqual(stored.totalPrice, 25 * 200);
});

test('10+1 and 20+3 with 45 units -> the 20+3 tier -> 6 free', async () => {
  const p = await product([{ buy: 10, free: 1 }, { buy: 20, free: 3 }]);
  const orderId = await order([{ productId: String(p._id), quantity: 45 }]);
  const line = await OrderItem.findOne({ orderId }).lean();
  assert.strictEqual(line.freeQuantity, 6);
  assert.deepStrictEqual(line.bonusApplied, { buy: 20, free: 3 });
});

test('the bonus applies on top of the offer and the manufacturer discount', async () => {
  const p = await product([{ buy: 10, free: 1 }]);
  await Offer.create({
    warehouseId: ids.warehouse, productId: p._id, titleAr: 'ع', titleEn: 'o', discountPercentage: 50,
    startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), status: 'approved',
  });
  const orderId = await order([{ productId: String(p._id), quantity: 10 }]);
  const line = await OrderItem.findOne({ orderId }).lean();
  assert.strictEqual(line.discountPrice, 100);
  assert.strictEqual(line.freeQuantity, 1);
});

test('a bonus that changed since the cart showed it is refused with BONUS_CHANGED', async () => {
  const p = await product([{ buy: 10, free: 1 }]);
  await assert.rejects(
    order([{ productId: String(p._id), quantity: 10, displayedBonuses: [] }]),
    (err) => {
      assert.strictEqual(err.code, 'BONUS_CHANGED');
      assert.deepStrictEqual(err.details.problems[0].currentBonuses, [{ buy: 10, free: 1 }]);
      return true;
    }
  );
  // With the bonus it is currently showing, the order goes through.
  const orderId = await order([{ productId: String(p._id), quantity: 10, displayedBonuses: [{ buy: 10, free: 1 }] }]);
  assert.ok(orderId);
});

test('an old client that sends no bonus is not checked', async () => {
  const p = await product([{ buy: 5, free: 1 }]);
  const orderId = await order([{ productId: String(p._id), quantity: 5 }]);
  assert.strictEqual((await OrderItem.findOne({ orderId }).lean()).freeQuantity, 1);
});

test('a warehouse quantity edit recomputes the free units from the frozen tiers', async () => {
  const p = await product([{ buy: 10, free: 1 }]);
  const orderId = await order([{ productId: String(p._id), quantity: 10 }]);
  // The product's bonus changes after the order was placed.
  await Product.updateOne({ _id: p._id }, { $set: { bonuses: [{ buy: 2, free: 1 }] } });
  const line = await OrderItem.findOne({ orderId }).lean();
  await warehouseOrderService.updateOrderItems(String(orderId), ids.warehouse, ids.warehouseUser, {
    updateItems: [{ orderItemId: String(line._id), quantity: 30 }],
  });
  const edited = await OrderItem.findById(line._id).lean();
  assert.strictEqual(edited.quantity, 30);
  assert.strictEqual(edited.freeQuantity, 3, 'still 10+1 - the terms the pharmacy ordered under');
});
