process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'warehouse-access-test-secret-at-least-32-characters';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Audit = require('../src/models/warehouseAudit.model');
const Subscription = require('../src/models/warehouseSubscription.model');
const access = require('../src/services/warehouseAccess.service');
const billing = require('../src/services/warehouseSubscription.service');
const { getMe } = require('../src/services/auth.service');
const { loadWarehouseOrThrow } = require('../src/utils/loadWarehouse');

let server, base, owner, accountant, admin, warehouse, other;
function token(user) { return jwt.sign({ sub: String(user._id || user.id), role: user.role, tokenVersion: 0 }, process.env.JWT_SECRET); }
async function request(user, path, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, { method, headers: {
    authorization: `Bearer ${token(user)}`, 'content-type': 'application/json',
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'warehouse-access-subscription' });
  await Promise.all([User.init(), Subscription.init()]);
  admin = await User.create({ name: 'Admin', phone: '+963944000001', role: 'admin', status: 'active' });
  owner = await User.create({ name: 'Owner', phone: '+963944000002', role: 'warehouse', warehouseRole: 'owner', status: 'active' });
  warehouse = await Warehouse.create({ userId: owner._id, nameAr: 'المستودع', nameEn: 'Warehouse', address: 'Latakia', city: 'Latakia', phone: '+963944000002' });
  other = await Warehouse.create({ userId: admin._id, nameAr: 'آخر', nameEn: 'Other', address: 'Jableh', city: 'Jableh', phone: '+963944000003' });
  const app = require('../src/app');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); });

test('admin adds a distinct accountant to the same warehouse without moving its owner or history', async () => {
  const result = await request(admin, `/admin/warehouses/${warehouse.id}/members`, 'POST', {
    name: 'Accountant', phone: '0944000004', password: 'test-password-2026', warehouseRole: 'accountant',
  });
  assert.equal(result.status, 201);
  accountant = result.body.member;
  assert.equal(accountant.warehouseRole, 'accountant');
  assert.equal(JSON.stringify(result.body).includes('password'), false);
  const profile = await getMe(accountant.id);
  assert.equal(String(profile.warehouse._id), warehouse.id);
  assert.equal(profile.user.warehouseRole, 'accountant');
  assert.equal(profile.user.mustChangePassword, true);
  assert.equal(String((await loadWarehouseOrThrow(accountant.id))._id), warehouse.id);
  assert.equal(String((await Warehouse.findById(warehouse.id)).userId), owner.id);
  assert.equal(await Audit.countDocuments({ action: 'member.created' }), 1);
});

test('warehouse operators cannot grant membership or inspect another warehouse subscription', async () => {
  assert.equal((await request(owner, `/admin/warehouses/${other.id}/members`)).status, 403);
  assert.equal((await request(accountant, `/admin/warehouses/${other.id}/subscription`)).status, 403);
  const own = await request(accountant, '/warehouse/balances');
  assert.equal(own.status, 200);
});

test('only accounting operators post cash; owner is rejected before payload handling', async () => {
  const denied = await request(owner, '/warehouse/payments', 'POST', {});
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'ACCOUNTANT_REQUIRED');
  const allowed = await request(accountant, '/warehouse/payments', 'POST', {});
  assert.equal(allowed.status, 400); // payload rejected by the payment service, not membership lookup
});

test('duplicate phone cannot create an orphan membership or a second audit', async () => {
  await assert.rejects(access.createWarehouseMember(other.id, admin.id, {
    name: 'Duplicate', phone: '0944000004', password: 'test-password-2026', warehouseRole: 'accountant',
  }), { code: 'PHONE_ALREADY_REGISTERED' });
  assert.equal((await Warehouse.findById(other.id)).memberUserIds.length, 0);
  assert.equal(await Audit.countDocuments({ action: 'member.created' }), 1);
});

test('concurrent first activation starts exactly one 30-day trial and repeated reads do not extend it', async () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const rows = await Promise.all(Array.from({ length: 4 }, () => billing.getSubscription(warehouse.id, { startTrial: true, now })));
  assert.equal(await Subscription.countDocuments({ warehouseId: warehouse.id }), 1);
  for (const row of rows) {
    assert.equal(row.state, 'trial');
    assert.equal(new Date(row.configuration.trialUntil).getTime() - now.getTime(), 30 * 86400000);
    assert.equal(row.features.loyalty, true);
  }
  const later = await billing.getSubscription(warehouse.id, { startTrial: true, now: new Date('2026-11-03T10:00:00Z') });
  assert.equal(String(later.configuration.startedAt), String(rows[0].configuration.startedAt));
});

test('expiry, grace and pause boundaries are computed without deleting historical access data', () => {
  const row = { status: 'trial', trialUntil: '2026-11-01T00:00:00Z', graceDays: 2, features: { loyalty: false } };
  assert.equal(billing.evaluateSubscription(row, new Date('2026-10-31T23:59:59Z')).state, 'trial');
  assert.equal(billing.evaluateSubscription(row, new Date('2026-11-01T00:00:00Z')).state, 'grace');
  assert.equal(billing.evaluateSubscription(row, new Date('2026-11-03T00:00:00Z')).state, 'expired');
  assert.equal(billing.evaluateSubscription(row, new Date('2026-10-31T23:59:59Z')).features.loyalty, false);
  assert.equal(billing.evaluateSubscription({ ...row, status: 'paused' }).features.accounting, false);
});

test('admin feature changes are audited and enforced against direct API requests', async () => {
  const updated = await request(admin, `/admin/warehouses/${warehouse.id}/subscription`, 'PUT', { features: { loyalty: false } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.features.loyalty, false);
  const denied = await request(accountant, '/warehouse/settings/loyalty', 'PUT', { enabled: true, tiers: [] });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'FEATURE_NOT_ENABLED');
  assert.equal((await request(accountant, '/warehouse/balances')).status, 200);
  assert.equal(await Audit.countDocuments({ action: 'subscription.updated' }), 1);
});

test('unknown features and active subscriptions without a paid expiry cannot be saved', async () => {
  await assert.rejects(billing.configureSubscription(warehouse.id, admin.id, { features: { unbuiltTarget: true } }), { code: 'INVALID_SUBSCRIPTION' });
  await assert.rejects(billing.configureSubscription(warehouse.id, admin.id, { status: 'active', paidUntil: null }), { code: 'INVALID_SUBSCRIPTION' });
  await billing.configureSubscription(warehouse.id, admin.id, { status: 'active', paidUntil: '2027-01-01T00:00:00Z' });
  await assert.rejects(billing.configureSubscription(warehouse.id, admin.id, { paidUntil: null }), { code: 'INVALID_SUBSCRIPTION' });
  assert.equal((await billing.getSubscription(warehouse.id)).configuration.paidUntil.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('subscription expiry blocks a new cash entry but allows confirmation of an already saved receipt', async () => {
  const Payment = require('../src/models/payment.model');
  const Pharmacy = require('../src/models/pharmacy.model');
  const pharmacyUser = await User.create({ name: 'Pharmacy', phone: '+963944000009', role: 'pharmacy', status: 'active' });
  const pharmacy = await Pharmacy.create({ userId: pharmacyUser.id, nameAr: 'صيدلية', nameEn: 'Pharmacy',
    ownerName: 'Pharmacist', address: 'Latakia', city: 'Latakia', areaType: 'rural', phone: '+963944000009', addedBy: 'self' });
  const key = 'saved-before-expiry';
  const payment = await Payment.create({ pharmacyId: pharmacy.id, warehouseId: warehouse.id, amount: 1000,
    currency: 'SYP', recordedBy: accountant.id, idempotencyKey: key });
  await billing.configureSubscription(warehouse.id, admin.id, { status: 'paused' });
  const fresh = await request(accountant, '/warehouse/payments', 'POST', { pharmacyId: pharmacy.id, amount: 1000, idempotencyKey: 'new-after-expiry' });
  assert.equal(fresh.status, 403);
  const replay = await request(accountant, '/warehouse/payments', 'POST', { pharmacyId: pharmacy.id, amount: 1000, currency: 'SYP', idempotencyKey: key });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.payment.id, payment.id);
  assert.equal(await Payment.countDocuments({ warehouseId: warehouse.id }), 1);
  assert.equal((await request(accountant, '/warehouse/balances')).status, 200);
});

test('admin can split a legacy login without changing warehouse ownership; stale tokens are revoked', async () => {
  const priorToken = token(accountant);
  const result = await request(admin, `/admin/warehouses/${warehouse.id}/members/${accountant.id}`, 'PUT', { warehouseRole: 'owner' });
  assert.equal(result.status, 200);
  assert.equal(result.body.members.find((row) => row.id === accountant.id).warehouseRole, 'owner');
  const response = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${priorToken}` } });
  assert.equal(response.status, 401);
  assert.equal(String((await Warehouse.findById(warehouse.id)).userId), owner.id);
  const wrongWarehouse = await request(admin, `/admin/warehouses/${other.id}/members/${owner.id}`, 'PUT', { warehouseRole: 'accountant' });
  assert.equal(wrongWarehouse.status, 404);
});
