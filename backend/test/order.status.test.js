// Order status flow: the warehouse's forward progression, the transitions it
// rejects, the pharmacist's cancellation window, and the user-facing wording of
// the status-change notification.
//
// The internal order.status enum is unchanged
// (pending -> confirmed -> preparing -> out_for_delivery -> delivered); only the
// user-facing terminology moved to Sent / Waiting for Approval / Preparing /
// On the Way / Delivered. This pins the transition rules (unchanged) and the
// notification text (updated).
//
// Own database, dropped at the end - same pattern as projection.select.test.js.
// realtime + notification are stubbed through require.cache so the emitted
// event and the notification payload can be observed without a socket server or
// FCM.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-order-status-tests';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const emitted = [];
const notifications = [];

function stubModule(relativePath, exportsValue) {
  const resolved = require.resolve(path.join(__dirname, '..', 'src', relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}

stubModule('realtime/index.js', {
  emitToWarehouse: (warehouseId, event, payload) =>
    emitted.push({ room: `warehouse:${warehouseId}`, event, payload }),
  emitToAdmins: (event, payload) => emitted.push({ room: 'admin', event, payload }),
  EVENTS: {
    ORDER_CREATED: 'order.created',
    ORDER_CANCELLED: 'order.cancelled',
    ORDER_STATUS_UPDATED: 'order.status.updated',
  },
});
stubModule('services/notification.service.js', {
  sendToUser: async (userId, payload) => {
    notifications.push({ userId: String(userId), ...payload });
  },
  sendToAll: async () => {},
});

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Order = require('../src/models/order.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');

const orderService = require('../src/services/order.service');
const warehouseOrderService = require('../src/services/warehouseOrder.service');

function withCode(expected) {
  return (err) => {
    assert.strictEqual(err.code, expected, `expected error code ${expected}, got ${err.code}`);
    return true;
  };
}

const ids = {};
let orderSeq = 1000;

async function makeOrder(status) {
  const order = await Order.create({
    orderNumber: ++orderSeq,
    pharmacyId: ids.pharmacy,
    warehouseId: ids.warehouse,
    status,
    totalPrice: 1000,
    discountAmount: 0,
    commissionAmount: 0,
    finalPrice: 1000,
    statusHistory: [{ status, changedBy: ids.pharmacyUser, changedAt: new Date() }],
  });
  return order;
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-order-status-test' });
  // Built up front, like every other test file whose orders reach 'delivered'
  // (ledger.delivery.test.js et al.). The final advance posts the charge inside
  // a transaction, and on a fresh database Mongoose's lazy background index
  // builds can conflict with that first transactional write. Under full-suite
  // load the conflicts outlasted runInTransaction's retry budget and surfaced
  // as an intermittent TRANSACTION_CONTENTION on the delivery step.
  await syncIndexes(Order, LedgerEntry, LedgerAccount);

  const [pharmacyUser, warehouseUser] = await User.create([
    { name: 'Pharm', phone: '0931111111', role: 'pharmacy', status: 'active' },
    { name: 'WH', phone: '0941111111', role: 'warehouse', status: 'active' },
  ]);
  ids.pharmacyUser = pharmacyUser._id;
  ids.warehouseUser = warehouseUser._id;

  const pharmacy = await Pharmacy.create({
    userId: pharmacyUser._id, nameAr: 'صيدلية', nameEn: 'Pharmacy', ownerName: 'Owner',
    address: 'a', city: 'Latakia', areaType: 'city', phone: '0931111111', addedBy: 'self',
  });
  const warehouse = await Warehouse.create({
    userId: warehouseUser._id, nameAr: 'مستودع', nameEn: 'Warehouse',
    address: 'r', city: 'Latakia', phone: '0941111111', deliveryType: 'self', isActive: true,
  });
  ids.pharmacy = pharmacy._id;
  ids.warehouse = warehouse._id;
});

test.after(async () => {
  await stopMemoryMongo();
});

test.beforeEach(() => {
  emitted.length = 0;
  notifications.length = 0;
});

// --- Initial state ----------------------------------------------------------

test('a new order model defaults to the "Sent" stage (status: pending)', () => {
  assert.strictEqual(Order.schema.path('status').defaultValue, 'pending');
  assert.deepStrictEqual(Order.schema.path('status').enumValues, [
    'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled',
  ]);
});

// --- Forward progression (Sent -> Waiting for Approval -> Preparing -> On the
//     Way -> Delivered) --------------------------------------------------------

test('the warehouse advances an order one stage at a time through the whole flow', async () => {
  const order = await makeOrder('pending');
  // Accepted -> on the way -> delivered: one tap per stage.
  const sequence = ['confirmed', 'out_for_delivery', 'delivered'];

  for (const expected of sequence) {
    const updated = await warehouseOrderService.advanceOrderStatus(
      order._id.toString(), ids.warehouse, ids.warehouseUser
    );
    assert.strictEqual(updated.status, expected);
    assert.strictEqual((await Order.findById(order._id)).status, expected);
  }
});

test('each advance emits one order.status.updated to the owning warehouse, carrying the internal status', async () => {
  const order = await makeOrder('pending');

  await warehouseOrderService.advanceOrderStatus(order._id.toString(), ids.warehouse, ids.warehouseUser);

  assert.strictEqual(emitted.length, 1);
  assert.strictEqual(emitted[0].room, `warehouse:${ids.warehouse}`);
  assert.strictEqual(emitted[0].event, 'order.status.updated');
  // Internal enum value is unchanged - the realtime payload is untouched.
  assert.strictEqual(emitted[0].payload.status, 'confirmed');
});

// --- Rejected transitions --------------------------------------------------

test('a delivered order cannot be advanced further', async () => {
  const order = await makeOrder('delivered');
  await assert.rejects(
    () => warehouseOrderService.advanceOrderStatus(order._id.toString(), ids.warehouse, ids.warehouseUser),
    withCode('ORDER_NOT_ADVANCEABLE')
  );
  assert.deepStrictEqual(emitted, []);
});

test('a cancelled order cannot be advanced', async () => {
  const order = await makeOrder('cancelled');
  await assert.rejects(
    () => warehouseOrderService.advanceOrderStatus(order._id.toString(), ids.warehouse, ids.warehouseUser),
    withCode('ORDER_NOT_ADVANCEABLE')
  );
  assert.deepStrictEqual(emitted, []);
});

test('a warehouse cannot advance an order that is not its own (IDOR)', async () => {
  const order = await makeOrder('pending');
  const otherWarehouseId = new mongoose.Types.ObjectId();
  await assert.rejects(
    () => warehouseOrderService.advanceOrderStatus(order._id.toString(), otherWarehouseId, ids.warehouseUser),
    withCode('ORDER_NOT_FOUND')
  );
  assert.deepStrictEqual(emitted, []);
});

// --- Cancellation window (unchanged) -------------------------------------

test('the pharmacist can cancel while Sent / Waiting for Approval / Preparing', async () => {
  for (const status of ['pending', 'confirmed', 'preparing']) {
    const order = await makeOrder(status);
    const { order: cancelled } = await orderService.cancelOrder(
      order._id.toString(), ids.pharmacy, ids.pharmacyUser
    );
    assert.strictEqual(cancelled.status, 'cancelled');
  }
});

test('the pharmacist cannot cancel once the order is On the Way or Delivered', async () => {
  for (const status of ['out_for_delivery', 'delivered']) {
    const order = await makeOrder(status);
    await assert.rejects(
      () => orderService.cancelOrder(order._id.toString(), ids.pharmacy, ids.pharmacyUser),
      withCode('ORDER_NOT_CANCELLABLE')
    );
  }
});

// --- Status-change notification wording --------------------------------

test('advancing to On the Way notifies the pharmacist with the new terminology', async () => {
  const order = await makeOrder('preparing');

  await warehouseOrderService.advanceOrderStatus(order._id.toString(), ids.warehouse, ids.warehouseUser);

  assert.strictEqual(notifications.length, 1);
  const note = notifications[0];
  assert.strictEqual(note.userId, String(ids.pharmacyUser));
  assert.match(note.bodyEn, /on the way/i);
  assert.doesNotMatch(note.bodyEn, /out for delivery/i);
  assert.match(note.bodyAr, /بالطريق/);
  assert.doesNotMatch(note.bodyAr, /خرج للتوصيل/);
});

test('advancing to Delivered notifies the pharmacist', async () => {
  const order = await makeOrder('out_for_delivery');

  await warehouseOrderService.advanceOrderStatus(order._id.toString(), ids.warehouse, ids.warehouseUser);

  assert.strictEqual(notifications.length, 1);
  assert.match(notifications[0].bodyEn, /has been delivered/i);
  assert.match(notifications[0].bodyAr, /تم تسليم/);
});

test('an older order left in a stage no longer used moves straight on to On the way', async () => {
  for (const legacy of ['preparing']) {
    const order = await makeOrder(legacy);
    const updated = await warehouseOrderService.advanceOrderStatus(order._id.toString(), ids.warehouse, ids.warehouseUser);
    assert.strictEqual(updated.status, 'out_for_delivery', legacy);
  }
});

test("the warehouse's accepted tab also lists an order left in an older stage; waiting holds only new ones", async () => {
  const pending = await makeOrder('pending');
  const accepted = await makeOrder('confirmed');
  const legacy = await makeOrder('preparing');
  const onTheWay = await makeOrder('out_for_delivery');
  const ids_ = async (status) =>
    new Set((await warehouseOrderService.listOrdersForWarehouse(ids.warehouse, status, { limit: 100 })).rows
      .map(({ order }) => order._id.toString()));
  const waiting = await ids_('pending');
  assert.ok(waiting.has(pending._id.toString()));
  assert.ok(!waiting.has(accepted._id.toString()));
  const acceptedTab = await ids_('confirmed');
  assert.ok(acceptedTab.has(accepted._id.toString()));
  assert.ok(acceptedTab.has(legacy._id.toString()));
  assert.ok(!acceptedTab.has(onTheWay._id.toString()));
});

test('accepting notifies the pharmacist that the order was accepted', async () => {
  const order = await makeOrder('pending');
  await warehouseOrderService.advanceOrderStatus(order._id.toString(), ids.warehouse, ids.warehouseUser);
  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(notifications[0].userId, String(ids.pharmacyUser));
  assert.match(notifications[0].bodyAr, /انقبلت/);
  assert.match(notifications[0].bodyEn, /accepted/);
});

test('the pharmacist tapping "received" delivers the order and tells the warehouse', async () => {
  const order = await makeOrder('out_for_delivery');
  const delivered = await warehouseOrderService.confirmReceivedByPharmacy(
    order._id.toString(), ids.pharmacy, ids.pharmacyUser
  );
  assert.strictEqual(delivered.status, 'delivered');
  assert.ok((await Order.findById(order._id)).invoiceNumber);
  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(notifications[0].userId, String(ids.warehouseUser));
  assert.match(notifications[0].bodyEn, /received order/);
});

test('"received" only works on an order on its way, and only on the pharmacy\'s own', async () => {
  const pending = await makeOrder('pending');
  await assert.rejects(
    () => warehouseOrderService.confirmReceivedByPharmacy(pending._id.toString(), ids.pharmacy, ids.pharmacyUser),
    withCode('ORDER_NOT_ON_THE_WAY')
  );
  const onTheWay = await makeOrder('out_for_delivery');
  await assert.rejects(
    () => warehouseOrderService.confirmReceivedByPharmacy(onTheWay._id.toString(), new mongoose.Types.ObjectId(), ids.pharmacyUser),
    withCode('ORDER_NOT_FOUND')
  );
});

test('an order on the road for a day closes on its own; a fresher one stays', async () => {
  const old = await makeOrder('out_for_delivery');
  await Order.updateOne({ _id: old._id }, { $set: { 'statusHistory.0.changedAt': new Date(Date.now() - 25 * 3600 * 1000) } });
  const fresh = await makeOrder('out_for_delivery');
  const closed = await warehouseOrderService.autoDeliverStaleOrders();
  assert.ok(closed >= 1);
  const oldNow = await Order.findById(old._id);
  assert.strictEqual(oldNow.status, 'delivered');
  assert.strictEqual(oldNow.statusHistory.at(-1).note, 'auto');
  assert.strictEqual((await Order.findById(fresh._id)).status, 'out_for_delivery');
  // The pharmacist is told it was delivered.
  assert.ok(notifications.some((n) => n.userId === String(ids.pharmacyUser) && /delivered/.test(n.bodyEn)));
});
