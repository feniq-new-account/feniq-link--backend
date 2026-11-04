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

test('subscription reads never create or renew a trial, including old startTrial clients', async () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const rows = await Promise.all(Array.from({ length: 4 }, () => billing.getSubscription(warehouse.id, { startTrial: true, now })));
  assert.equal(await Subscription.countDocuments({ warehouseId: warehouse.id }), 0);
  for (const row of rows) {
    assert.equal(row.state, 'promotion');
    assert.equal(row.configuration, null);
    assert.equal(row.features.loyalty, true);
  }
});

test('admin feature changes are audited and enforced against direct API requests', async () => {
  const updated = await request(admin, `/admin/warehouses/${warehouse.id}/subscription`, 'PUT', { revision: 0, features: { loyalty: false } });
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

test('commercial pause preserves cash recording and idempotent receipt replay', async () => {
  const Payment = require('../src/models/payment.model');
  const Pharmacy = require('../src/models/pharmacy.model');
  const pharmacyUser = await User.create({ name: 'Pharmacy', phone: '+963944000009', role: 'pharmacy', status: 'active' });
  const pharmacy = await Pharmacy.create({ userId: pharmacyUser.id, nameAr: 'صيدلية', nameEn: 'Pharmacy',
    ownerName: 'Pharmacist', address: 'Latakia', city: 'Latakia', areaType: 'rural', phone: '+963944000009', addedBy: 'self' });
  await require('../src/models/exchangeRate.model').create({ _id: 'singleton', usdToSyp: 15000, source: 'manual' });
  const key = 'saved-before-expiry';
  const payment = await Payment.create({ pharmacyId: pharmacy.id, warehouseId: warehouse.id, amount: 1000,
    currency: 'SYP', recordedBy: accountant.id, idempotencyKey: key });
  await billing.configureSubscription(warehouse.id, admin.id, { status: 'paused' });
  const fresh = await request(accountant, '/warehouse/payments', 'POST', { pharmacyId: pharmacy.id, amount: 1000, idempotencyKey: 'new-after-expiry', allowUnlinked: true, unlinkedReason: 'Opening payment recorded during acceptance' });
  assert.equal(fresh.status, 201);
  const replay = await request(accountant, '/warehouse/payments', 'POST', { pharmacyId: pharmacy.id, amount: 1000, currency: 'SYP', idempotencyKey: key });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.payment.id, payment.id);
  assert.equal(await Payment.countDocuments({ warehouseId: warehouse.id }), 2);
  assert.equal((await request(accountant, '/warehouse/balances')).status, 200);
});

test('admin can split a legacy login without changing warehouse ownership; stale tokens are revoked', async () => {
  const priorToken = token(accountant);
  const result = await request(admin, `/admin/warehouses/${warehouse.id}/members/${accountant.id}`, 'PUT', { warehouseRole: 'owner', revision: 0, reason: 'Separate owner responsibilities' });
  assert.equal(result.status, 200);
  assert.equal(result.body.members.find((row) => row.id === accountant.id).warehouseRole, 'owner');
  const response = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${priorToken}` } });
  assert.equal(response.status, 401);
  assert.equal(String((await Warehouse.findById(warehouse.id)).userId), owner.id);
  const wrongWarehouse = await request(admin, `/admin/warehouses/${other.id}/members/${owner.id}`, 'PUT', { warehouseRole: 'accountant', revision: 0, reason: 'Foreign target test' });
  assert.equal(wrongWarehouse.status, 404);
});
test('member role writes require a reason and current revision; stale changes cannot overwrite access', async () => {
  const path = `/admin/warehouses/${warehouse.id}/members/${accountant.id}`;
  assert.equal((await request(admin, path, 'PUT', { warehouseRole: 'accountant' })).status, 400);
  const stale = await request(admin, path, 'PUT', { warehouseRole: 'accountant', revision: 0, reason: 'Stale operator' });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'MEMBER_ACCESS_CHANGED');
  assert.equal((await User.findById(accountant.id)).warehouseRole, 'owner');
});
test('administrator cannot remove the only active owner by a role change', async () => {
  const holder = await User.create({ name: 'Sole owner', phone: '+963944000030', role: 'warehouse', warehouseRole: 'owner', status: 'active' });
  const isolated = await Warehouse.create({ userId: holder.id, nameAr: 'مستقل', nameEn: 'Isolated', address: 'Latakia', city: 'Latakia', phone: holder.phone });
  await assert.rejects(access.setWarehouseMemberRole(isolated.id, holder.id, admin.id, 'accountant', {
    revision: 0, reason: 'Last owner test',
  }), { code: 'LAST_WAREHOUSE_OWNER' });
  assert.equal((await User.findById(holder.id)).warehouseRole, 'owner');
});
test('concurrent access changes keep one winner, revoke sessions once and audit the reason', async () => {
  const member = await access.createWarehouseMember(warehouse.id, admin.id, {
    name: 'Concurrent member', phone: '+963944000031', password: 'test-password-2026', warehouseRole: 'accountant',
  });
  const outcomes = await Promise.allSettled([1, 2].map(n => access.setWarehouseMemberRole(warehouse.id, member.id, admin.id, 'owner', {
    revision: 0, reason: `Access change ${n}`,
  })));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(r => r.status === 'rejected').reason.code, 'MEMBER_ACCESS_CHANGED');
  const user = await User.findById(member.id);
  assert.equal(user.accessRevision, 1); assert.equal(user.tokenVersion, 1);
  const event = await Audit.findOne({ action: 'member.role_changed', 'after.userId': user._id }).lean();
  assert.match(event.reason, /^Access change [12]$/);
  assert.equal(event.before.revision, 0); assert.equal(event.after.revision, 1);
});
test('member listings and self-auth return the same effective permissions without exposing credentials', async () => {
  const members = await access.listWarehouseMembers(warehouse.id);
  const own = await request(owner, '/auth/me');
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.user.permissions, members.find(m => String(m.id) === owner.id).permissions);
  assert.equal(own.body.user.permissions.paymentRecord, false);
  assert.equal(JSON.stringify(members).includes('tokenVersion'), false);
});
test('concurrent downgrades of different owners cannot leave a warehouse without an owner', async () => {
  const first = await User.create({ name: 'First owner', phone: '+963944000033', role: 'warehouse', warehouseRole: 'owner', status: 'active' });
  const second = await User.create({ name: 'Second owner', phone: '+963944000034', role: 'warehouse', warehouseRole: 'owner', status: 'active' });
  const isolated = await Warehouse.create({ userId: first.id, memberUserIds: [second.id], nameAr: 'ملكية متزامنة',
    nameEn: 'Concurrent ownership', address: 'Latakia', city: 'Latakia', phone: first.phone });
  const outcomes = await Promise.allSettled([first, second].map(user => access.setWarehouseMemberRole(isolated.id, user.id, admin.id, 'accountant', {
    revision: 0, reason: 'Concurrent owner downgrade',
  })));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'LAST_WAREHOUSE_OWNER');
  assert.equal(await User.countDocuments({ _id: { $in: [first.id, second.id] }, warehouseRole: 'owner', status: 'active' }), 1);
  assert.equal(await Audit.countDocuments({ warehouseId: isolated.id, action: 'member.role_changed' }), 1);
  assert.equal((await Warehouse.findById(isolated.id)).memberAccessRevision, 1);
});
test('failed access audit rolls back the role and session revision; successful commit disconnects live sessions', async () => {
  const member = await access.createWarehouseMember(warehouse.id, admin.id, {
    name: 'Audit member', phone: '+963944000032', password: 'test-password-2026', warehouseRole: 'accountant',
  });
  const realtime = require('../src/realtime');
  const originalAudit = Audit.create, originalDisconnect = realtime.disconnectUser;
  const disconnected = [];
  realtime.disconnectUser = id => disconnected.push(id);
  Audit.create = async () => { throw new Error('Access audit unavailable'); };
  try {
    await assert.rejects(access.setWarehouseMemberRole(warehouse.id, member.id, admin.id, 'owner', { revision: 0, reason: 'Atomic access change' }), /Access audit unavailable/);
    const unchanged = await User.findById(member.id);
    assert.equal(unchanged.warehouseRole, 'accountant'); assert.equal(unchanged.tokenVersion, 0);
    assert.deepEqual(disconnected, []);
    Audit.create = originalAudit;
    await access.setWarehouseMemberRole(warehouse.id, member.id, admin.id, 'owner', { revision: 0, reason: 'Atomic access change' });
    assert.deepEqual(disconnected, [String(member.id)]);
  } finally { Audit.create = originalAudit; realtime.disconnectUser = originalDisconnect; }
});
