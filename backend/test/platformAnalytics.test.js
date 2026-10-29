process.env.NODE_ENV = 'test'; process.env.JWT_SECRET ||= 'platform-analytics-tests-32-characters-secret'; process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
const test = require('node:test'); const assert = require('node:assert/strict'); const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model'); const Warehouse = require('../src/models/warehouse.model');
const Pharmacy = require('../src/models/pharmacy.model'); const Order = require('../src/models/order.model');
const Product = require('../src/models/product.model'); const Catalog = require('../src/models/productCatalog.model'); const Item = require('../src/models/orderItem.model');
const ledger = require('../src/services/ledger.service'); const { runInTransaction } = require('../src/utils/transaction');
const service = require('../src/services/platformAnalytics.service'); const billing = require('../src/services/warehouseSubscription.service');
let admin, whUser, phUser, wh, other, a, b, c, first, server, base;
const now = new Date('2026-10-29T15:00:00Z'), oid = () => new mongoose.Types.ObjectId();
async function makeOrder(pharmacy, warehouse, createdAt, status = 'delivered', extra = {}) {
  return Order.create({ orderNumber: ++first, pharmacyId: pharmacy.id, warehouseId: warehouse.id, status,
    totalPrice: 1000, discountAmount: 0, commissionAmount: 0, finalPrice: 1000, createdAt: new Date(createdAt), ...extra });
}
async function post(ph, warehouse, kind, amountSyp, at) {
  const account = await ledger.resolveAccount(ph.id, warehouse.id);
  return runInTransaction((session) => ledger.postEntry({ account, kind, amountSyp, effectiveAt: new Date(at),
    source: kind === 'charge' ? { orderId: oid() } : kind === 'payment' ? { paymentId: oid() } : { returnId: oid() }, createdBy: admin.id }, session));
}
const originalMongooseNow = mongoose.now;
test.before(async () => {
  mongoose.now = () => new Date('2026-10-29T03:00:00Z');
  await startMemoryMongo({ dbName: 'platform-analytics' }); first = 992000;
  admin = await User.create({ name: 'Admin', phone: '+963944000001', role: 'admin', status: 'active' });
  whUser = await User.create({ name: 'Warehouse', phone: '+963944000002', role: 'warehouse', status: 'active' });
  phUser = await User.create({ name: 'Pharmacy', phone: '+963944000003', role: 'pharmacy', status: 'active' });
  wh = await Warehouse.create({ userId: whUser.id, nameAr: 'A', nameEn: 'A', city: 'Latakia', address: 'Street', phone: whUser.phone });
  other = await Warehouse.create({ userId: oid(), nameAr: 'B', nameEn: 'B', city: 'Jableh', address: 'Street', phone: '+963944000004' });
  const pharmacy = (name, city, n) => Pharmacy.create({ userId: n === 1 ? phUser.id : oid(), nameAr: name, nameEn: name, ownerName: 'Owner',
    city, areaType: n === 1 ? 'rural' : 'city', address: 'Street', phone: `+96395500000${n}`, addedBy: 'self' });
  a = await pharmacy('A', 'Latakia', 1); b = await pharmacy('B', 'Jableh', 2); c = await pharmacy('C', 'Jableh', 3);
  await makeOrder(a, wh, '2026-09-10'); // previous buyer retained now
  await makeOrder(b, other, '2026-08-01'); // returns after skipping previous window
  const order = await makeOrder(a, wh, '2026-10-15T06:00Z', 'delivered', { statusHistory: [
    { status: 'confirmed', changedAt: new Date('2026-10-15T08:00Z'), changedBy: whUser.id },
    { status: 'delivered', changedAt: new Date('2026-10-15T12:00Z'), changedBy: whUser.id }] });
  await makeOrder(b, other, '2026-10-20', 'pending'); await makeOrder(c, wh, '2026-10-20', 'cancelled', { cancelReason: 'Unavailable' });
  await post(a, wh, 'charge', 10000, '2026-10-15'); await post(b, other, 'charge', 20000, '2026-10-20');
  await post(a, wh, 'return_credit', 2000, '2026-10-25'); await post(a, wh, 'payment', 1000, '2026-10-28');
  const master = await Catalog.create({ nameAr: 'دواء موحد', manufacturerAr: 'شركة' });
  const product = await Product.create({ warehouseId: wh.id, masterProductId: master.id, nameAr: 'دواء', manufacturerAr: 'شركة', price: 1, isAvailable: true });
  const second = product; // A package line and a plain line may share the same medicine.
  await Item.create([product, second].map((p) => ({ orderId: order.id, productId: p.id, productNameAr: 'دواء موحد', manufacturerAr: 'شركة', quantity: 100, unitPrice: 1, discountPrice: 1 })));
  await billing.configureSubscription(other.id, admin.id, { features: { loyalty: false } });
  server = require('../src/app').listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api/admin/analytics`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); mongoose.now = originalMongooseNow; });
test('platform sums reconcile across regions, daily series and the immutable ledger', async () => {
  const data = await service.report({ period: 'month', force: '1' }, now);
  assert.equal(data.orders.requestedOrders, 3); assert.equal(data.orders.cancelledOrders, 1); assert.equal(data.orders.requestedSyp, 2000);
  assert.equal(data.totals.netSalesSyp, 28000); assert.equal(data.totals.collectionsSyp, 1000);
  assert.equal(data.regions.reduce((s, r) => s + r.netSalesSyp, 0), data.totals.netSalesSyp);
  assert.equal(data.daily.reduce((s, r) => s + r.netSalesSyp, 0), data.totals.netSalesSyp);
  assert.equal(data.regions.find((r) => r.city === 'Latakia').netSalesSyp, 8000);
});
test('retention uses the prior equal-duration cohort, and durations exclude missing timestamps', async () => {
  const data = await service.report({ period: 'month' }, now);
  assert.deepEqual(data.retention, { current: 2, previous: 1, retained: 1, returned: 1, percent: 100 });
  assert.equal(data.timing.acceptanceHours, 2); assert.equal(data.timing.deliveryHours, 6); assert.equal(data.timing.deliveredSamples, 1);
  assert.deepEqual(data.cancellationReasons, [{ reason: 'Unavailable', count: 1 }]);
});
test('demand counts a unified medicine once per order and exposes no inventory quantities', async () => {
  const data = await service.report({ period: 'month' }, now);
  assert.equal(data.demand.length, 1); assert.equal(data.demand[0].orders, 1); assert.equal(data.demand[0].linked, true);
  assert.equal(data.demand[0].quantity, undefined); assert.equal(data.demand[0].stockQuantity, undefined);
  assert.equal(data.subscriptions.warehouses, 2); assert.equal(data.subscriptions.featureAvailability.loyalty, 1);
});
test('a return-only period can have negative net sales; an empty period does not invent rates', async () => {
  const data = await service.report({ period: 'custom', from: '2026-10-25', to: '2026-10-25', force: '1' }, now);
  assert.equal(data.orders.requestedOrders, 0); assert.equal(data.totals.netSalesSyp, -2000);
  assert.equal(data.timing.deliveryHours, null); assert.equal(data.retention.percent, null);
  await assert.rejects(service.report({ period: 'custom', from: '2020-01-01', to: '2026-10-29' }, now), { code: 'INVALID_PERIOD' });
});
test('admin analytics are inaccessible to warehouse and pharmacy accounts', async () => {
  const jwt = require('jsonwebtoken');
  for (const [person, status] of [[admin, 200], [whUser, 403], [phUser, 403]]) {
    const token = jwt.sign({ sub: person.id, role: person.role, tokenVersion: 0 }, process.env.JWT_SECRET);
    const response = await fetch(base, { headers: { authorization: `Bearer ${token}` } }); assert.equal(response.status, status);
  }
});
