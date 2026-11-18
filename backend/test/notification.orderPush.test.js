// A new order must reach the warehouse's managers even with the app closed and
// the phone asleep in a pocket. Two things make that true on the server side:
//
// 1. Every push goes as Android high priority (normal priority is held back by
//    Doze), and the order alert names the app's "new orders" channel, which
//    rings and vibrates at maximum importance.
// 2. It goes to every active owner login of the warehouse, not only the
//    primary account - managers run orders from those logins. Accountants and
//    suspended members are left out.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-order-push-tests-pad';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

// FCM stand-in: records every multicast instead of sending it.
const sent = [];
const firebasePath = require.resolve(path.join(__dirname, '..', 'src', 'config', 'firebase.js'));
require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    messaging: {
      sendEachForMulticast: async (message) => {
        sent.push(message);
        return { successCount: message.tokens.length, failureCount: 0,
          responses: message.tokens.map(() => ({ success: true })) };
      },
    },
  },
};

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Notification = require('../src/models/notification.model');
const notificationService = require('../src/services/notification.service');
const orderService = require('../src/services/order.service');

const ids = {};

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-order-push-test' });
  const device = (n) => [{ fcmToken: `token-${n}`, deviceType: 'android' }];
  const [primary, owner, accountant, blockedOwner, pharmacyUser] = await User.create([
    { name: 'Primary', phone: '0941000001', role: 'warehouse', status: 'active', deviceTokens: device(1) },
    { name: 'Owner', phone: '0941000002', role: 'warehouse', warehouseRole: 'owner', status: 'active', deviceTokens: device(2) },
    { name: 'Accountant', phone: '0941000003', role: 'warehouse', warehouseRole: 'accountant', status: 'active', deviceTokens: device(3) },
    { name: 'Blocked', phone: '0941000004', role: 'warehouse', warehouseRole: 'owner', status: 'blocked', deviceTokens: device(4) },
    { name: 'Pharm', phone: '0931000001', role: 'pharmacy', status: 'active' },
  ]);
  Object.assign(ids, { primary: primary._id, owner: owner._id, accountant: accountant._id,
    blockedOwner: blockedOwner._id, pharmacyUser: pharmacyUser._id });
  const pharmacy = await Pharmacy.create({
    userId: pharmacyUser._id, nameAr: 'صيدلية النور', nameEn: 'Al Nour', ownerName: 'O',
    address: 'a', city: 'Latakia', areaType: 'city', phone: '0931000001', addedBy: 'self',
  });
  const warehouse = await Warehouse.create({
    userId: primary._id, memberUserIds: [owner._id, accountant._id, blockedOwner._id],
    nameAr: 'مستودع', nameEn: 'Warehouse', address: 'r', city: 'Latakia',
    phone: '0941000001', deliveryType: 'self', isActive: true,
  });
  ids.pharmacy = pharmacy._id;
  ids.warehouse = warehouse._id;
});

test.after(async () => {
  await stopMemoryMongo();
});

test.beforeEach(async () => {
  sent.length = 0;
  await Notification.deleteMany({});
});

const fakeOrder = () => ({ _id: ids.warehouse, orderNumber: 77, warehouseId: ids.warehouse, pharmacyId: ids.pharmacy });

test('a new order is pushed to the primary login and every active owner, never the accountant', async () => {
  await orderService._notifyWarehouseOfOrder(fakeOrder(), 'created');

  const rows = await Notification.find({}).lean();
  const recipients = rows.map((r) => String(r.userId)).sort();
  assert.deepStrictEqual(recipients, [String(ids.primary), String(ids.owner)].sort());
  assert.ok(rows.every((r) => r.titleAr === 'طلبية جديدة'));

  const tokens = sent.flatMap((m) => m.tokens).sort();
  assert.deepStrictEqual(tokens, ['token-1', 'token-2']);
});

test('the order push is high priority on the ringing new-orders channel', async () => {
  await orderService._notifyWarehouseOfOrder(fakeOrder(), 'created');

  assert.ok(sent.length > 0);
  for (const message of sent) {
    assert.strictEqual(message.android.priority, 'high');
    assert.strictEqual(message.android.notification.channelId, 'feniq_new_orders');
    assert.strictEqual(message.android.notification.sound, 'default');
    assert.strictEqual(message.android.notification.defaultVibrateTimings, true);
    assert.strictEqual(message.android.notification.priority, 'max');
    assert.strictEqual(message.android.ttl, 24 * 60 * 60 * 1000);
    assert.strictEqual(message.data.androidChannel, 'feniq_new_orders');
    assert.strictEqual(message.apns.headers['apns-priority'], '10');
  }
});

test('a cancellation goes on the same channel, to the same people', async () => {
  await orderService._notifyWarehouseOfOrder(fakeOrder(), 'cancelled');
  const rows = await Notification.find({}).lean();
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every((r) => r.titleAr === 'طلبية ملغاة'));
  assert.ok(sent.every((m) => m.android.notification.channelId === 'feniq_new_orders'));
});

test('every other push is still high priority, on the default channel', async () => {
  await notificationService.sendToUser(ids.owner, {
    titleAr: 'ع', titleEn: 'T', bodyAr: 'ن', bodyEn: 'B', type: 'system',
  });
  assert.strictEqual(sent.length, 1);
  const [message] = sent;
  assert.strictEqual(message.android.priority, 'high');
  assert.strictEqual(message.android.notification.channelId, 'phoenix_default_channel');
  assert.strictEqual(message.android.ttl, undefined);
  assert.strictEqual(message.data.androidChannel, 'phoenix_default_channel');
});

test('an unknown channel name falls back to the default channel', () => {
  const options = notificationService._platformOptions({ androidChannel: 'made_up' });
  assert.strictEqual(options.android.notification.channelId, 'phoenix_default_channel');
});

// A field FCM does not know makes it answer 'invalid-argument', which
// sendToUser treats as a dead token and deletes - every manager would silently
// stop getting pushes. The SDK validator checks types but passes unknown names
// straight through, so the names are pinned to the SDK's own (messaging-api.d.ts).
test('both push shapes use only real Firebase fields and pass the SDK validator', () => {
  const internal = path.join(path.dirname(require.resolve('firebase-admin/messaging')), 'messaging-internal.js');
  const { validateMessage } = require(internal);
  const ANDROID = ['collapseKey', 'priority', 'ttl', 'restrictedPackageName', 'data', 'notification', 'fcmOptions', 'directBootOk'];
  const ANDROID_NOTIFICATION = ['title', 'body', 'icon', 'color', 'sound', 'tag', 'imageUrl', 'clickAction',
    'bodyLocKey', 'bodyLocArgs', 'titleLocKey', 'titleLocArgs', 'channelId', 'ticker', 'sticky', 'eventTimestamp',
    'localOnly', 'priority', 'vibrateTimingsMillis', 'defaultVibrateTimings', 'defaultSound', 'lightSettings',
    'defaultLightSettings', 'visibility', 'notificationCount', 'proxy'];
  for (const androidChannel of [undefined, notificationService.NEW_ORDERS_ANDROID_CHANNEL]) {
    const options = notificationService._platformOptions({ androidChannel });
    for (const key of Object.keys(options.android)) assert.ok(ANDROID.includes(key), `android.${key}`);
    for (const key of Object.keys(options.android.notification)) {
      assert.ok(ANDROID_NOTIFICATION.includes(key), `android.notification.${key}`);
    }
    const message = { token: 'x', notification: { title: 't', body: 'b' }, data: { type: 'order_update' }, ...options };
    assert.doesNotThrow(() => validateMessage(JSON.parse(JSON.stringify(message))));
  }
});
