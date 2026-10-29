process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'monthly-loyalty-test-secret-at-least-32-characters';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const Return = require('../src/models/return.model');
const Credit = require('../src/models/pharmacyCredit.model');
const CreditEntry = require('../src/models/creditEntry.model');
const Period = require('../src/models/monthlyLoyaltyPeriod.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const orders = require('../src/services/order.service');
const warehouseOrders = require('../src/services/warehouseOrder.service');
const warehouseReturns = require('../src/services/warehouseReturn.service');
const settings = require('../src/services/warehouseSettings.service');
const loyalty = require('../src/services/monthlyLoyalty.service');
const billing = require('../src/services/warehouseSubscription.service');
const financialAudit = require('../src/services/financialAudit.service');
let phone = 0;
const tiers = [{ minSyp: 100000, discountSyp: 1000 }, { minSyp: 200000, discountSyp: 5000 }];
const id = (row) => String(row._id || row.id);
async function setup() {
  const user = await User.create({ name: 'Warehouse', role: 'warehouse', status: 'active', phone: `+963944${String(++phone).padStart(6, '0')}` });
  const wh = await Warehouse.create({ userId: user.id, nameAr: 'مستودع', nameEn: 'Warehouse', city: 'Latakia', address: 'Street', phone: user.phone,
    loyalty: { enabled: true, mode: 'monthly', tiers } });
  const phUser = await User.create({ name: 'Pharmacist', role: 'pharmacy', status: 'active', phone: `+963944${String(++phone).padStart(6, '0')}` });
  const ph = await Pharmacy.create({ userId: phUser.id, nameAr: 'صيدلية', nameEn: 'Pharmacy', ownerName: 'Owner', city: 'Latakia', areaType: 'city', address: 'Street', phone: phUser.phone, addedBy: 'self' });
  const product = await Product.create({ warehouseId: wh.id, nameAr: 'MED', manufacturerAr: 'Company', unitAr: 'علبة', price: 1, isActive: true, isAvailable: true });
  const filter = { warehouseId: wh.id, pharmacyId: ph.id };
  const place = (quantity) => orders.createOrder({ userId: phUser._id, pharmacyId: ph._id, warehouseId: wh._id,
    items: [{ productId: product.id, quantity }], notes: null });
  const deliver = async (order) => {
    while (true) {
      const row = await Order.findById(id(order));
      if (row.status === 'delivered') return row;
      await warehouseOrders.advanceOrderStatus(row.id, wh._id, user._id);
    }
  };
  const wallet = () => Credit.findOne(filter).lean();
  return { user, wh, phUser, ph, product, filter, place, deliver, wallet };
}
async function fullReturn(ctx, order) {
  const items = await OrderItem.find({ orderId: id(order) });
  return Return.create({ orderId: id(order), warehouseId: ctx.wh.id, pharmacyId: ctx.ph.id,
    items: items.map((item) => ({ orderItemId: item.id, productId: item.productId, quantity: item.quantity, reasonType: 'damaged' })) });
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'monthly-loyalty' });
  await Promise.all([Credit.init(), CreditEntry.init(), Period.init()]);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 1000, source: 'manual' });
});
test.after(stopMemoryMongo);

test('monthly mode snapshots its promise without applying the per-order discount or earning before delivery', async () => {
  const ctx = await setup();
  const pending = await ctx.place(100);
  const row = await Order.findById(id(pending));
  assert.equal(row.finalPrice, 100000);
  assert.equal(row.loyaltyDiscountAmount, 0);
  assert.equal(row.monthlyLoyalty.tiers.length, 2);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 0);
  await orders.cancelOrder(row.id, ctx.ph._id, ctx.phUser._id);
  assert.equal(await CreditEntry.countDocuments({ ...ctx.filter, kind: 'loyalty_earned' }), 0);
});
test('successive delivered net purchases earn only the additional threshold amount', async () => {
  const ctx = await setup();
  await ctx.deliver(await ctx.place(100));
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 1000);
  const second = await ctx.place(101); // 101000 less the earlier 1000 credit
  assert.equal((await Order.findById(id(second))).finalPrice, 100000);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 0);
  await ctx.deliver(second);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 4000);
  const entries = await CreditEntry.find({ ...ctx.filter, kind: 'loyalty_earned' }).sort({ createdAt: 1 });
  assert.deepEqual(entries.map((row) => row.amountSyp), [1000, 4000]);
  const period = await Period.findOne(ctx.filter);
  assert.equal(period.eligibleSyp, 200000);
  assert.equal(period.entitlementSyp, 5000);
});
test('two deliveries racing on the same monthly threshold cannot duplicate the reward', async () => {
  const ctx = await setup();
  const pending = await Promise.all([ctx.place(100), ctx.place(100)]);
  for (const order of pending) {
    while ((await Order.findById(id(order))).status !== 'out_for_delivery') {
      await warehouseOrders.advanceOrderStatus(id(order), ctx.wh._id, ctx.user._id);
    }
  }
  await Promise.all(pending.map((order) => warehouseOrders.advanceOrderStatus(id(order), ctx.wh._id, ctx.user._id)));
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 5000);
  assert.equal((await Period.findOne(ctx.filter)).eligibleSyp, 200000);
});
test('a return reverses spent loyalty against future rewards without taking commission credit or creating cash debt', async () => {
  const ctx = await setup();
  const first = await ctx.deliver(await ctx.place(100));
  await ctx.deliver(await ctx.place(101));
  const spending = await ctx.place(10); // reserves 4000 loyalty
  await Credit.updateOne(ctx.filter, { $set: { balanceSyp: 700 } });
  const returned = await fullReturn(ctx, first);
  await warehouseReturns.approveReturn(returned.id, ctx.wh._id, ctx.user._id);
  const wallet = await ctx.wallet();
  assert.equal(wallet.loyaltyBalanceSyp, -4000);
  assert.equal(wallet.balanceSyp, 700);
  const reversal = await CreditEntry.findOne({ returnId: returned.id, kind: 'loyalty_reversed' });
  assert.equal(reversal.amountSyp, 4000);
  await ctx.deliver(spending);
  await ctx.deliver(await ctx.place(100));
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 0, 'the next earned 4000 offsets only the loyalty shortfall');
  await assert.rejects(warehouseReturns.approveReturn(returned.id, ctx.wh._id, ctx.user._id));
});
test('cancelling and editing a reservation return credit to the correct source once', async () => {
  const ctx = await setup();
  await ctx.deliver(await ctx.place(100));
  await Credit.updateOne(ctx.filter, { $set: { balanceSyp: 300 } });
  const pending = await ctx.place(2); // uses 300 commission + 1000 loyalty
  const item = await OrderItem.findOne({ orderId: id(pending) });
  await warehouseOrders.updateOrderItems(id(pending), ctx.wh._id, ctx.user._id, { updateItems: [{ orderItemId: item.id, quantity: 1 }] });
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 300);
  assert.equal((await ctx.wallet()).balanceSyp, 0);
  await orders.cancelOrder(id(pending), ctx.ph._id, ctx.phUser._id);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 1000);
  assert.equal((await ctx.wallet()).balanceSyp, 300);
});
test('month boundaries use Damascus time and the first terms remain frozen for that month', async () => {
  const ctx = await setup();
  const order = await Order.findById(id(await ctx.place(100)));
  const key = await loyalty.prepareDelivery(order, new Date('2026-10-31T21:30:00Z'));
  assert.equal(key, '2026-11');
  order.monthlyLoyalty.tiers = [{ minSyp: 100000, discountSyp: 9000 }];
  await loyalty.prepareDelivery(order, new Date('2026-11-02T10:00:00Z'));
  assert.equal((await Period.findOne({ ...ctx.filter, period: key })).tiers.length, 0, 'preparing a delivery must not freeze terms');
  await ctx.deliver(order);
  const current = await Period.findOne({ ...ctx.filter, period: require('../src/utils/businessTime').businessDateOf(new Date()).slice(0, 7) });
  assert.equal(current.tiers[0].discountSyp, 1000);
});
test('disabling the paid feature stops new earning promises while preserving earned spendable credit', async () => {
  const ctx = await setup();
  await ctx.deliver(await ctx.place(100));
  await billing.configureSubscription(ctx.wh.id, ctx.user.id, { features: { loyalty: false } });
  const next = await Order.findById(id(await ctx.place(10)));
  assert.equal(next.monthlyLoyalty, null);
  assert.equal(next.creditUsedSyp, 1000);
  assert.equal(next.loyaltyDiscountAmount, 0);
});
test('a failed return audit rolls back monthly entitlement, wallet, return and cash-ledger changes together', async (t) => {
  const ctx = await setup();
  const delivered = await ctx.deliver(await ctx.place(100));
  const returned = await fullReturn(ctx, delivered);
  t.mock.method(financialAudit, 'record', async () => { throw new Error('audit unavailable'); });
  await assert.rejects(warehouseReturns.approveReturn(returned.id, ctx.wh._id, ctx.user._id), /audit unavailable/);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 1000);
  assert.equal((await Period.findOne(ctx.filter)).entitlementSyp, 1000);
  assert.equal((await Return.findById(returned.id)).status, 'pending');
});

test('monthly reward tiers cannot decrease at a higher purchase threshold', async () => {
  const ctx = await setup();
  await assert.rejects(settings.updateLoyalty(ctx.wh.id, { mode: 'monthly', enabled: true,
    tiers: [{ minSyp: 100000, discountSyp: 2000 }, { minSyp: 200000, discountSyp: 1000 }],
  }), (error) => error.code === 'INVALID_LOYALTY_TIERS');
  assert.equal((await Warehouse.findById(ctx.wh.id)).loyalty.tiers[1].discountSyp, 5000);
});

test('two configuration writers cannot overwrite each other and only the winner is audited', async () => {
  const ctx = await setup();
  const changes = { enabled: true, mode: 'monthly', tiers, revision: 0, actorId: ctx.user.id };
  const results = await Promise.allSettled([settings.updateLoyalty(ctx.wh.id, changes), settings.updateLoyalty(ctx.wh.id, changes)]);
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  assert.equal(results.find((row) => row.status === 'rejected').reason.code, 'LOYALTY_CHANGED');
  assert.equal((await Warehouse.findById(ctx.wh.id)).loyalty.revision, 1);
  assert.equal(await require('../src/models/warehouseAudit.model').countDocuments({ warehouseId: ctx.wh.id, action: 'loyalty.configured' }), 1);
});

test('a partial return below a threshold reverses only the lost tier increment using its net invoice credit', async () => {
  const ctx = await setup();
  const first = await ctx.place(100), second = await ctx.place(100);
  await ctx.deliver(first); await ctx.deliver(second);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 5000);
  const item = await OrderItem.findOne({ orderId: id(second) });
  const returned = await Return.create({ orderId: id(second), warehouseId: ctx.wh.id, pharmacyId: ctx.ph.id,
    items: [{ orderItemId: item.id, productId: item.productId, quantity: 1, reasonType: 'damaged' }] });
  await warehouseReturns.approveReturn(returned.id, ctx.wh._id, ctx.user._id);
  assert.equal((await Return.findById(returned.id)).creditSyp, 1000);
  assert.equal((await Period.findOne(ctx.filter)).eligibleSyp, 199000);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 1000);
  assert.equal((await Order.findById(id(second))).monthlyLoyalty.reversedSyp, 1000);
});


test('a failed first delivery cannot freeze stale reward tiers for the first successful delivery', async (t) => {
  const ctx = await setup();
  const first = await ctx.place(100);
  t.mock.method(financialAudit, 'record', async () => { throw new Error('audit unavailable'); });
  await assert.rejects(ctx.deliver(first), /audit unavailable/);
  assert.equal((await Period.findOne(ctx.filter)).tiers.length, 0);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 0);
  t.mock.restoreAll();
  await settings.updateLoyalty(ctx.wh.id, { enabled: true, mode: 'monthly', revision: 0, tiers: [{ minSyp: 100000, discountSyp: 9000 }] });
  const second = await ctx.place(100);
  await ctx.deliver(second);
  assert.equal((await Period.findOne(ctx.filter)).tiers[0].discountSyp, 9000);
  assert.equal((await ctx.wallet()).loyaltyBalanceSyp, 9000);
  assert.equal((await Order.findById(id(first))).status, 'out_for_delivery');
});
