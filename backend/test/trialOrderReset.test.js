// Pre-launch trial order reset (owner decision 2026-11-17): undelivered trial
// orders are cancelled by an admin with a reason; delivered orders and the
// ledger are never touched; a stale preview writes nothing.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-trial-order-reset-tests';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/unused';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const emitted = [];
const notifications = [];
function stubModule(relativePath, exportsValue) {
  const resolved = require.resolve(path.join(__dirname, '..', 'src', relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}
stubModule('realtime/index.js', {
  emitToWarehouse: (warehouseId, event, payload) => emitted.push({ warehouseId: String(warehouseId), event, payload }),
  emitToAdmins: () => {},
  emitToUser: () => {},
  EVENTS: { ORDER_CREATED: 'order.created', ORDER_CANCELLED: 'order.cancelled', ORDER_STATUS_UPDATED: 'order.status.updated' },
});
stubModule('services/notification.service.js', {
  sendToUser: async (userId, payload) => { notifications.push({ userId: String(userId), ...payload }); },
  sendToAll: async () => {},
});

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Order = require('../src/models/order.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const PharmacyCredit = require('../src/models/pharmacyCredit.model');
const FinancialAuditLog = require('../src/models/financialAuditLog.model');
const service = require('../src/services/trialOrderReset.service');
const warehouseOrderService = require('../src/services/warehouseOrder.service');

const ids = {};
let orderSeq = 5000;
const DAY = 24 * 60 * 60 * 1000;

async function makeOrder(status, { pharmacy = ids.pharmacyA, createdAt = new Date(Date.now() - 2 * DAY), creditUsedSyp = 0 } = {}) {
  const order = await Order.create({
    orderNumber: ++orderSeq, pharmacyId: pharmacy, warehouseId: ids.warehouse, status,
    totalPrice: 1000, discountAmount: 0, commissionAmount: 0, finalPrice: 1000, creditUsedSyp,
    statusHistory: [{ status, changedBy: ids.pharmacyUser, changedAt: createdAt }],
  });
  await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt } });
  if (creditUsedSyp > 0) {
    // The real path: the pharmacy had earned credit, and this order spent it.
    await PharmacyCredit.updateOne({ pharmacyId: pharmacy, warehouseId: ids.warehouse },
      { $inc: { balanceSyp: creditUsedSyp } }, { upsert: true });
    await require('../src/services/pharmacyCredit.service').useCredit(
      { pharmacyId: pharmacy, warehouseId: ids.warehouse, orderId: order._id, amountSyp: creditUsedSyp }, null);
  }
  return order;
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-trial-order-reset' });
  await syncIndexes(Order, LedgerEntry, LedgerAccount);
  const [pharmacyUser, pharmacyUserB, warehouseUser, admin] = await User.create([
    { name: 'Pharm A', phone: '0931111201', role: 'pharmacy', status: 'active' },
    { name: 'Pharm B', phone: '0931111202', role: 'pharmacy', status: 'active' },
    { name: 'WH', phone: '0941111201', role: 'warehouse', status: 'active' },
    { name: 'Admin', phone: '0951111201', role: 'admin', status: 'active' },
  ]);
  ids.pharmacyUser = pharmacyUser._id;
  ids.admin = admin._id;
  const base = { ownerName: 'Owner', address: 'a', city: 'Latakia', areaType: 'city', addedBy: 'self' };
  const [a, b] = await Pharmacy.create([
    { ...base, userId: pharmacyUser._id, nameAr: 'صيدلية أ', nameEn: 'A', phone: '0931111201' },
    { ...base, userId: pharmacyUserB._id, nameAr: 'صيدلية ب', nameEn: 'B', phone: '0931111202' },
  ]);
  ids.pharmacyA = a._id;
  ids.pharmacyB = b._id;
  ids.pharmacyUserB = pharmacyUserB._id;
  const warehouse = await Warehouse.create({
    userId: warehouseUser._id, nameAr: 'مستودع التجربة', nameEn: 'Trial WH',
    address: 'r', city: 'Latakia', phone: '0941111201', deliveryType: 'self', isActive: true,
  });
  ids.warehouse = warehouse._id;
});
test.after(stopMemoryMongo);

const reason = 'انتهت فترة التجربة، أعد الطلب من فضلك';

test('preview counts trial orders by status, reports delivered ones and writes nothing', async () => {
  await makeOrder('pending');
  await makeOrder('confirmed', { pharmacy: ids.pharmacyB });
  await makeOrder('out_for_delivery', { creditUsedSyp: 200 });
  await makeOrder('delivered');
  await makeOrder('cancelled');
  await makeOrder('pending', { createdAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) }); // after any sane cutoff
  const before = new Date().toISOString();
  const preview = await service.previewTrialOrderReset({ before });
  assert.equal(preview.resettableCount, 3);
  assert.equal(preview.statusCounts.delivered, 1);
  assert.equal(preview.statusCounts.cancelled, 1);
  assert.equal(preview.affectedPharmacies, 2);
  assert.equal(preview.deliveredUntouched.orders, 1);
  assert.equal(preview.warehouses[0].nameAr, 'مستودع التجربة');
  assert.equal(await Order.countDocuments({ status: 'cancelled' }), 1);
});

test('the cutoff, reason and confirmation are all required', async () => {
  const before = new Date().toISOString();
  await assert.rejects(service.previewTrialOrderReset({ before: undefined }), { code: 'INVALID_TRIAL_RESET' });
  await assert.rejects(service.previewTrialOrderReset({ before: new Date(Date.now() + DAY).toISOString() }), { code: 'INVALID_TRIAL_RESET' });
  await assert.rejects(service.executeTrialOrderReset(ids.admin, { before, reason: 'short', confirmCount: 3 }), { code: 'INVALID_TRIAL_RESET' });
  await assert.rejects(service.executeTrialOrderReset(ids.admin, { before, reason, confirmCount: 0 }), { code: 'INVALID_TRIAL_RESET' });
  await assert.rejects(service.executeTrialOrderReset(ids.admin, { before, reason, confirmCount: 3, extra: 1 }), { code: 'INVALID_TRIAL_RESET' });
  // A stale preview: nothing is written.
  await assert.rejects(service.executeTrialOrderReset(ids.admin, { before, reason, confirmCount: 2 }), { code: 'TRIAL_RESET_CHANGED' });
  assert.equal(await Order.countDocuments({ status: 'cancelled' }), 1);
});

test('execute cancels only undelivered trial orders, leaves the ledger alone and tells each pharmacy once', async () => {
  const ledgerBefore = await LedgerEntry.countDocuments({});
  const delivered = await Order.findOne({ status: 'delivered' }).lean();
  const before = new Date().toISOString();
  const result = await service.executeTrialOrderReset(ids.admin, { before, reason, confirmCount: 3 });
  assert.deepEqual(result.failed, [], JSON.stringify(result.failed));
  assert.equal(result.cancelled, 3);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.failed, []);
  assert.equal(result.after.resettableCount, 0);
  assert.equal(result.notifiedPharmacies, 2);

  const cancelled = await Order.find({ status: 'cancelled', cancelReason: reason }).lean();
  assert.equal(cancelled.length, 3);
  for (const order of cancelled) {
    assert.equal(String(order.cancelledBy), String(ids.admin));
    const last = order.statusHistory.at(-1);
    assert.equal(last.status, 'cancelled');
    assert.equal(last.note, service.HISTORY_NOTE);
  }
  assert.equal((await Order.findById(delivered._id).lean()).status, 'delivered');
  assert.equal(await Order.countDocuments({ status: 'pending' }), 1); // the one after the cutoff
  assert.equal(await LedgerEntry.countDocuments({}), ledgerBefore);

  const audits = await FinancialAuditLog.find({ action: 'order.admin_cancelled' }).lean();
  assert.equal(audits.length, 3);
  assert.ok(audits.every(row => row.reason === reason && String(row.actorId) === String(ids.admin)));
  assert.deepEqual(new Set(audits.map(row => row.before.status)), new Set(['pending', 'confirmed', 'out_for_delivery']));

  // The credit the on-the-road order used went back to the pharmacy.
  const credit = await PharmacyCredit.findOne({ pharmacyId: ids.pharmacyA, warehouseId: ids.warehouse }).lean();
  assert.equal(credit.balanceSyp, 200);

  assert.equal(emitted.filter(e => e.event === 'order.cancelled').length, 3);
  const targets = notifications.map(n => n.userId).sort();
  assert.deepEqual(targets, [String(ids.pharmacyUser), String(ids.pharmacyUserB)].sort());
  assert.ok(notifications.every(n => n.bodyAr.includes(reason)));
});

test('a cancelled on-the-road order is never auto-delivered and a rerun finds nothing', async () => {
  const closed = await warehouseOrderService.autoDeliverStaleOrders(new Date(Date.now() + 3 * DAY));
  assert.equal(closed, 0);
  const preview = await service.previewTrialOrderReset({ before: new Date().toISOString() });
  assert.equal(preview.resettableCount, 0);
  await assert.rejects(service.executeTrialOrderReset(ids.admin, { before: new Date().toISOString(), reason, confirmCount: 1 }),
    { code: 'TRIAL_RESET_CHANGED' });
});

test('an order delivered between preview and execute is skipped, not cancelled', async () => {
  const order = await makeOrder('pending');
  const before = new Date().toISOString();
  const preview = await service.previewTrialOrderReset({ before });
  assert.equal(preview.resettableCount, 1);
  // Simulate the warehouse winning the race inside the run.
  const original = Order.findOneAndUpdate.bind(Order);
  let raced = false;
  Order.findOneAndUpdate = async function (filter, ...rest) {
    if (!raced && String(filter._id) === String(order._id)) {
      raced = true;
      await Order.collection.updateOne({ _id: order._id }, { $set: { status: 'delivered' } });
    }
    return original(filter, ...rest);
  };
  try {
    const result = await service.executeTrialOrderReset(ids.admin, { before, reason, confirmCount: 1 });
    assert.equal(result.cancelled, 0);
    assert.equal(result.skipped, 1);
  } finally {
    Order.findOneAndUpdate = original;
  }
  assert.equal((await Order.findById(order._id).lean()).status, 'delivered');
});

test('the admin endpoints refuse anonymous callers', async () => {
  const app = require('../src/app');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const get = await fetch(base + '/api/admin/maintenance/trial-orders?before=' + encodeURIComponent(new Date().toISOString()));
    assert.equal(get.status, 401);
    const post = await fetch(base + '/api/admin/maintenance/trial-orders/cancel', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ before: new Date().toISOString(), reason, confirmCount: 1 }),
    });
    assert.equal(post.status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
