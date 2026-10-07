// The warehouse's own push for a new order and for a pharmacy cancelling one -
// what reaches the Feniq app on the warehouse's phone (the realtime events only
// reach an open panel).
//
// Own database, dropped at the end; realtime and notification are stubbed
// through require.cache like order.status.test.js, so the pushes can be read.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-warehouse-notify-tests';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const notifications = [];
let failSend = false;

function stubModule(relativePath, exportsValue) {
  const resolved = require.resolve(path.join(__dirname, '..', 'src', relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}

stubModule('realtime/index.js', {
  emitToWarehouse: () => {},
  emitToAdmins: () => {},
  EVENTS: {
    ORDER_CREATED: 'order.created',
    ORDER_CANCELLED: 'order.cancelled',
    ORDER_STATUS_UPDATED: 'order.status.updated',
  },
});
stubModule('services/notification.service.js', {
  sendToUser: async (userId, payload) => {
    if (failSend) throw new Error('FCM down');
    notifications.push({ userId: String(userId), ...payload });
  },
  sendToAll: async () => {},
});

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ExchangeRate = require('../src/models/exchangeRate.model');

const orderService = require('../src/services/order.service');

const ids = {};

function createRealOrder() {
  return orderService.createOrder({
    userId: ids.pharmacyUser,
    pharmacyId: ids.pharmacy,
    warehouseId: ids.warehouse,
    items: [{ productId: ids.product.toString(), quantity: 1 }],
    notes: null,
  });
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-warehouse-notify-test' });
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });

  const [pharmacyUser, warehouseUser] = await User.create([
    { name: 'Pharm', phone: '0931333333', role: 'pharmacy', status: 'active' },
    { name: 'WH', phone: '0941333333', role: 'warehouse', status: 'active' },
  ]);
  ids.pharmacyUser = pharmacyUser._id;
  ids.warehouseUser = warehouseUser._id;

  const pharmacy = await Pharmacy.create({
    userId: pharmacyUser._id, nameAr: 'صيدلية الياسمين', nameEn: 'Al-Yasmin Pharmacy', ownerName: 'Owner',
    address: 'a', city: 'Latakia', areaType: 'city', phone: '0931333333', addedBy: 'self',
  });
  const warehouse = await Warehouse.create({
    userId: warehouseUser._id, nameAr: 'مستودع', nameEn: 'Warehouse',
    address: 'r', city: 'Latakia', phone: '0941333333', deliveryType: 'self', isActive: true,
    discountRate: 0, commissionRate: 0,
  });
  ids.pharmacy = pharmacy._id;
  ids.warehouse = warehouse._id;

  const product = await Product.create({
    warehouseId: warehouse._id, nameAr: 'دواء', nameEn: 'Drug',
    manufacturerAr: 'شركة', manufacturerEn: 'Pharma', price: 10,
    unitAr: 'علبة', unitEn: 'box', isAvailable: true, isActive: true,
  });
  ids.product = product._id;
});

test.after(async () => {
  await stopMemoryMongo();
});

test.beforeEach(() => {
  notifications.length = 0;
  failSend = false;
});

test('a new order pushes the warehouse account, naming the order and the pharmacy', async () => {
  const order = await createRealOrder();
  assert.strictEqual(notifications.length, 1);
  const note = notifications[0];
  assert.strictEqual(note.userId, String(ids.warehouseUser));
  assert.strictEqual(note.type, 'order_update');
  assert.strictEqual(String(note.relatedOrderId), String(order._id));
  assert.strictEqual(note.titleAr, 'طلبية جديدة');
  assert.strictEqual(note.titleEn, 'New order');
  assert.match(note.bodyAr, new RegExp(`${order.orderNumber}.*صيدلية الياسمين`));
  assert.match(note.bodyEn, new RegExp(`#${order.orderNumber} from Al-Yasmin Pharmacy`));
});

test('a pharmacy cancelling pushes the warehouse account', async () => {
  const order = await createRealOrder();
  notifications.length = 0;
  await orderService.cancelOrder(order._id.toString(), ids.pharmacy, ids.pharmacyUser);
  assert.strictEqual(notifications.length, 1);
  const note = notifications[0];
  assert.strictEqual(note.userId, String(ids.warehouseUser));
  assert.strictEqual(note.titleEn, 'Order cancelled');
  assert.match(note.bodyEn, new RegExp(`Al-Yasmin Pharmacy cancelled order #${order.orderNumber}`));
  assert.match(note.bodyAr, /ألغت/);
});

test('a failed push never fails the order', async () => {
  failSend = true;
  const order = await createRealOrder();
  assert.ok(order._id);
  assert.strictEqual(order.status, 'pending');
});
