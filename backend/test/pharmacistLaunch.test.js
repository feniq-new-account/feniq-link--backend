process.env.JWT_SECRET ||= 'pharmacist-launch-tests-secret-at-least-32';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const RefreshToken = require('../src/models/refreshToken.model');
const PlatformSetting = require('../src/models/platformSetting.model');
const auth = require('../src/services/auth.service');
const launch = require('../src/services/launch.service');
const orders = require('../src/services/order.service');
const app = require('../src/app');
let server, base;
let sequence = 0;
const payload = () => ({ name: 'Test Pharmacist', pharmacyName: 'Test Pharmacy',
  phone: `094400${String(++sequence).padStart(4, '0')}`, address: 'Manual address',
  areaType: 'rural', areaName: 'ريف اللاذقية', password: 'TestingPassword123' });
async function call(method, path, body, token) {
  const res = await fetch(base + path, { method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'pharmacist-launch', orderingOpen: false });
  await syncIndexes(User, Pharmacy, RefreshToken, PlatformSetting);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await stopMemoryMongo(); });
test('public default is registration-only and exposes no admin history', async () => {
  const result = await call('GET', '/app/status');
  assert.equal(result.status, 200);
  assert.equal(result.body.status.orderingEnabled, false);
  assert.equal(result.body.status.mode, 'registration_only');
  assert.equal(result.body.status.history, undefined);
});
test('new orders are refused before warehouse, credit or stock work', async () => {
  await assert.rejects(orders.createOrder({ pharmacyId: 'invalid', warehouseId: 'invalid', items: [] }),
    error => error.code === 'ORDERING_NOT_STARTED' && error.statusCode === 409);
});
test('registration without GPS rejects the other spelling and permits password recovery from a lost response', async () => {
  const data = payload();
  const result = await auth.register(data);
  assert.equal(result.pharmacy.areaName, data.areaName);
  assert.equal(result.pharmacy.location?.coordinates?.length || 0, 0);
  await assert.rejects(auth.register({ ...data, phone: `+963${data.phone.slice(1)}` }), error => error.code === 'PHONE_ALREADY_REGISTERED');
  assert.equal((await auth.loginWithPassword({ phone: data.phone, password: data.password })).user.id, result.user.id);
});
test('concurrent phone spellings leave exactly one complete account', async () => {
  const data = payload();
  const results = await Promise.allSettled([auth.register(data), auth.register({ ...data, phone: `+963${data.phone.slice(1)}` })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'PHONE_ALREADY_REGISTERED');
  assert.equal(await Pharmacy.countDocuments({ phone: { $in: [data.phone, `+963${data.phone.slice(1)}`] } }), 1);
});
test('profile storage failure rolls the user back', async () => {
  const data = payload(); const original = Pharmacy.create;
  Pharmacy.create = async () => { throw new Error('simulated storage failure'); };
  try { await assert.rejects(auth.register(data), /simulated storage failure/); }
  finally { Pharmacy.create = original; }
  assert.equal(await User.countDocuments({ phone: data.phone }), 0);
});
test('pending pharmacy edits its own non-credential fields; changed coordinates revoke location approval', async () => {
  const own = await auth.register(payload());
  await User.updateOne({ _id: own.user.id }, { $set: { status: 'pending' } });
  await Pharmacy.updateOne({ _id: own.pharmacy.id }, { $set: { locationApproval: 'approved', location: { type: 'Point', coordinates: [35.7, 35.5] } } });
  const updated = await call('PATCH', '/auth/profile', { name: 'Updated Name', areaName: 'جبلة', latitude: 35.4, longitude: 35.8 }, own.token);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.status, 'pending');
  assert.equal(updated.body.pharmacy.ownerName, 'Updated Name');
  assert.equal(updated.body.pharmacy.areaName, 'جبلة');
  assert.equal(updated.body.pharmacy.locationApproval, 'pending');
  const pending = await require('../src/services/admin.service').listPendingAccounts();
  const adminRow = pending.find(row => String(row.user._id) === own.user.id);
  assert.equal(adminRow.pharmacy.areaName, 'جبلة');
  assert.deepEqual([...adminRow.pharmacy.location.coordinates], [35.8, 35.4]);
  for (const changes of [{ phone: '0944999999' }, { status: 'active' }, { latitude: 42 }, { role: 'admin' }]) {
    assert.equal((await call('PATCH', '/auth/profile', changes, own.token)).status, 400);
  }
  assert.equal((await call('PUT', '/admin/launch', { mode: 'ordering_open', message: 'Ready', revision: 0 }, own.token)).status, 403);
});
test('revision protects admin settings and changes retain their audit history', async () => {
  const admin = await User.create({ name: 'Launch admin', phone: '0944999999', role: 'admin', status: 'active' });
  const open = await launch.saveLaunch(admin.id, { mode: 'ordering_open', message: 'Ready', revision: 0 });
  assert.equal(open.revision, 1); await launch.assertOrderingOpen();
  await assert.rejects(launch.saveLaunch(admin.id, { mode: 'registration_only', message: 'Wait', revision: 0 }), error => error.code === 'LAUNCH_CHANGED');
  const closed = await launch.saveLaunch(admin.id, { mode: 'registration_only', message: 'Preparing', revision: 1 });
  assert.equal(closed.history.length, 2); assert.equal(String(closed.updatedBy), admin.id);
  await assert.rejects(launch.assertOrderingOpen(), error => error.code === 'ORDERING_NOT_STARTED');
});

test('an already committed order replays after ordering closes, including an old client', async () => {
  const Order = require('../src/models/order.model');
  const own = await auth.register(payload());
  const row = await Order.collection.insertOne({ pharmacyId: own.pharmacy._id,
    warehouseId: own.pharmacy._id, idempotencyKey: 'lost-response-replay', orderNumber: 123, status: 'pending' });
  const replay = await orders.createOrder({ pharmacyId: own.pharmacy._id,
    warehouseId: own.pharmacy._id, items: [], idempotencyKey: 'lost-response-replay' });
  assert.equal(String(replay._id), String(row.insertedId));
  const result = await call('POST', '/orders', { warehouseId: String(own.pharmacy._id),
    items: [{ productId: String(own.pharmacy._id), quantity: 1 }], idempotencyKey: 'new-attempt' }, own.token);
  assert.equal(result.status, 409); assert.equal(result.body.code, 'ORDERING_NOT_STARTED');
  assert.equal(await Order.countDocuments({ pharmacyId: own.pharmacy._id }), 1);
});

test('pilot ordering expires on server time without a cron, including stale mobile clients', async () => {
  const admin = await User.findOne({ role: 'admin', status: 'active' });
  const existing = await launch.readLaunch();
  const deadline = new Date(Date.now() + 60000).toISOString();
  const config = await launch.saveLaunch(admin.id, {
    mode: 'ordering_open', message: 'Pilot weekend', revision: existing.revision,
    orderingClosesAt: deadline,
  });
  assert.equal(config.orderingClosesAt, deadline);
  const stillOpen = launch.publicStatus(config, Date.parse(deadline) - 1);
  assert.equal(stillOpen.orderingEnabled, true);
  assert.equal(stillOpen.mode, 'ordering_open');
  assert.equal(stillOpen.orderingClosedByDeadline, false);
  const justExpired = launch.publicStatus(config, Date.parse(deadline));
  assert.equal(justExpired.orderingEnabled, false);
  assert.equal(justExpired.mode, 'registration_only');
  assert.equal(justExpired.orderingClosedByDeadline, true);
  assert.match(justExpired.message, /انتهت فترة تجربة الطلبات/);
  assert.equal(launch.publicStatus(config, Date.parse(deadline) + 1).mode, 'registration_only');
  assert.equal((await call('GET', '/app/status')).body.status.orderingClosesAt, deadline);
  await launch.assertOrderingOpen();

  await assert.rejects(launch.saveLaunch(admin.id, {
    mode: 'ordering_open', message: 'Past deadline', revision: config.revision,
    orderingClosesAt: new Date(Date.now() - 60000).toISOString(),
  }), error => error.code === 'INVALID_LAUNCH_DEADLINE');
  await assert.rejects(launch.saveLaunch(admin.id, {
    mode: 'ordering_open', message: 'Invalid time', revision: config.revision,
    orderingClosesAt: '2026-11-09 00:00',
  }), error => error.code === 'INVALID_LAUNCH_SETTINGS');

  // Closing is persistent and leaves history, but no background job or
  // payment/ledger write is needed to enforce the expiry in createOrder.
  const closed = await launch.saveLaunch(admin.id, {
    mode: 'registration_only', message: 'Preparing launch', revision: config.revision,
    orderingClosesAt: null,
  });
  assert.equal(closed.history.at(-1).orderingClosesAt, deadline);
  await assert.rejects(launch.assertOrderingOpen(), error => error.code === 'ORDERING_NOT_STARTED');
});

test('older admin clients cannot accidentally erase an existing close deadline', async () => {
  const admin = await User.findOne({ role: 'admin', status: 'active' });
  const existing = await launch.readLaunch();
  const deadline = new Date(Date.now() + 120000).toISOString();
  const config = await launch.saveLaunch(admin.id, {
    mode: 'ordering_open', message: 'Testing', revision: existing.revision,
    orderingClosesAt: deadline,
  });
  const fromLegacyClient = await launch.saveLaunch(admin.id, {
    mode: 'ordering_open', message: 'Old UI saved', revision: config.revision,
  });
  assert.equal(fromLegacyClient.orderingClosesAt, deadline);
  await launch.saveLaunch(admin.id, {
    mode: 'registration_only', message: 'Closed', revision: fromLegacyClient.revision,
    orderingClosesAt: null,
  });
});

test('expired pilot status is accepted by strict pre-expiry Android clients', async () => {
  const oldClientParser = (status) => {
    if (!['registration_only', 'ordering_open'].includes(status.mode) ||
        typeof status.message !== 'string' ||
        status.orderingEnabled !== (status.mode === 'ordering_open')) {
      throw new Error('Invalid launch status');
    }
    return status.orderingEnabled;
  };
  const expiry = Date.parse('2026-11-08T21:00:00.000Z');
  const live = launch.publicStatus({
    mode: 'ordering_open', message: 'Pilot is live', revision: 5,
    orderingClosesAt: new Date(expiry).toISOString(),
  }, expiry - 1);
  const closed = launch.publicStatus({
    mode: 'ordering_open', message: 'Pilot is live', revision: 5,
    orderingClosesAt: new Date(expiry).toISOString(),
  }, expiry);
  assert.equal(oldClientParser(live), true);
  assert.equal(oldClientParser(closed), false);
  assert.equal(closed.orderingClosedByDeadline, true);
  assert.notEqual(closed.message, 'Pilot is live');
  // The effective public mode can close without changing persisted config.
  assert.equal(closed.orderingClosesAt, '2026-11-08T21:00:00.000Z');
  assert.equal(launch.publicStatus({
    mode: 'registration_only', message: 'Manual closure', revision: 6,
    orderingClosesAt: closed.orderingClosesAt,
  }, expiry).message, 'Manual closure');
});
