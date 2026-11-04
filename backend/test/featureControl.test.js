process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1/unused';
process.env.JWT_SECRET = 'feature-control-test-only-secret-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Control = require('../src/models/warehouseFeatureControl.model');
const Audit = require('../src/models/featureControlAudit.model');
const service = require('../src/services/featureControl.service');
const { evaluateEntitlements } = require('../src/utils/featureEntitlements');
let admin, owner, accountant, wh, server, base;
const future = new Date('2027-02-01T00:00:00Z');
async function req(user, path, method = 'GET', body) {
  const token = jwt.sign({ sub: String(user._id), role: user.role, tokenVersion: 0 }, process.env.JWT_SECRET);
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() };
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'feature-control' });
  admin = await User.create({ name: 'Admin', phone: '+963944100001', role: 'admin', status: 'active' });
  owner = await User.create({ name: 'Owner', phone: '+963944100002', role: 'warehouse', warehouseRole: 'owner', status: 'active' });
  accountant = await User.create({ name: 'Accountant', phone: '+963944100003', role: 'warehouse', warehouseRole: 'accountant', status: 'active' });
  wh = await Warehouse.create({ userId: owner.id, memberUserIds: [accountant.id], nameAr: 'قبول', nameEn: 'Acceptance', address: 'Latakia', city: 'Latakia', phone: owner.phone });
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await stopMemoryMongo(); });

test('bundle grant snapshots cover features without inventing packages; add-on duplication is rejected', async () => {
  const bundle = await service.createBundle(admin.id, { code: 'acceptance-only-v1', name: 'Acceptance definition',
    features: ['ownerMobileAccess', 'ownerInsights'], decisionRef: 'acceptance-contract-only', reason: 'Testing explicit contract snapshots' });
  assert.equal(bundle.features.length, 2);
  const granted = await service.addGrant(wh.id, admin.id, { revision: 0, reason: 'Acceptance grant', kind: 'bundle',
    sourceCode: bundle.code, startsAt: '2027-01-08', endsAt: '2027-04-01', decisionRef: 'acceptance-only' });
  assert.equal(granted.revision, 1);
  assert.equal((await service.getEntitlements(wh.id, { now: future })).features.ownerMobileAccess, true);
  await assert.rejects(service.addGrant(wh.id, admin.id, { revision: 1, reason: 'Duplicate add-on', kind: 'addon', features: ['ownerMobileAccess'],
    startsAt: '2027-02-01', endsAt: '2027-03-01', decisionRef: 'acceptance-only' }), { code: 'FEATURE_ALREADY_INCLUDED' });
  assert.equal((await Control.findOne({ warehouseId: wh.id })).grants.length, 1);
  assert.equal(await Audit.countDocuments({ action: 'entitlement.granted' }), 1);
});
test('platform and warehouse switches deny granted features on direct backend paths, preserving core', async () => {
  const first = await service.savePlatform(admin.id, { revision: 0, reason: 'Acceptance switch', features: { ownerInsights: false } });
  assert.equal(first.revision, 1);
  const result = await service.getEntitlements(wh.id, { now: future });
  assert.equal(result.decisions.ownerInsights.reason, 'platform_disabled');
  assert.equal(result.features.ownerMobileAccess, true);
  assert.equal(result.core.paymentRecording, true);
  const report = await req(owner, '/warehouse/insights/report');
  assert.equal(report.status, 403);
  assert.equal(report.body.code, 'FEATURE_UNAVAILABLE');
  await assert.rejects(service.savePlatform(admin.id, { revision: 1, reason: 'Invalid core paywall', features: { basicOrders: false } }), { code: 'INVALID_FEATURE_CONTROL' });
});
test('an explicitly approved advanced bundle always includes owner mobile independently of insights', async () => {
  const result = await service.createBundle(admin.id, { code: 'advanced-acceptance-v1', name: 'Acceptance only', tier: 'advanced',
    features: ['salesReports'], decisionRef: 'acceptance-only', reason: 'Approved rule inclusion test' });
  assert.ok(result.features.includes('ownerMobileAccess'));
  assert.equal(result.features.includes('ownerInsights'), false);
});
test('concurrent administrative changes cannot overwrite each other and only the winner is audited', async () => {
  const attempts = await Promise.allSettled([
    service.savePlatform(admin.id, { revision: 1, reason: 'First operator', features: { loyalty: false } }),
    service.savePlatform(admin.id, { revision: 1, reason: 'Second operator', features: { loyalty: true } }),
  ]);
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(r => r.status === 'rejected').reason.code, 'FEATURE_CONTROL_CHANGED');
  assert.equal(await Audit.countDocuments({ action: 'platform.features.updated' }), 2);
});
test('self configuration cannot grant entitlement or alter another tenant; accountants cannot configure', async () => {
  assert.equal((await req(owner, '/admin/feature-control')).status, 403);
  assert.equal((await req(owner, `/admin/warehouses/${wh.id}/entitlements`)).status, 403);
  assert.equal((await req(accountant, '/warehouse/entitlements/configuration', 'PUT', {
    revision: 1, reason: 'Not owner', features: { ownerInsights: false },
  })).status, 403);
  const saved = await req(owner, '/warehouse/entitlements/configuration', 'PUT', {
    revision: 1, reason: 'Owner preference', features: { ownerInsights: false },
  });
  assert.equal(saved.status, 200);
  const self = await req(owner, '/warehouse/entitlements');
  assert.equal(self.status, 200);
  assert.equal(self.body.configuration.grants, undefined);
  assert.equal(self.body.decisions.ownerInsights.sources, undefined);
  assert.equal((await req(owner, '/warehouse/entitlements/configuration', 'PUT', {
    revision: 2, reason: 'Self grant attempt', features: { ownerMobileAccess: true },
  })).status, 400);
  assert.equal((await req(admin, `/admin/warehouses/${wh.id}/entitlements`)).status, 200);
});
test('revocation, future activation and exact expiry do not erase grants or mutate legacy contracts', async () => {
  const row = await Control.findOne({ warehouseId: wh.id }).lean();
  const grant = row.grants[0];
  await service.revokeGrant(wh.id, grant._id, admin.id, { revision: row.revision, reason: 'Acceptance complete' });
  const result = await service.getEntitlements(wh.id, { now: future });
  assert.equal(result.features.ownerMobileAccess, false);
  assert.equal(result.configuration.grants.length, 1);
  assert.equal(await Audit.countDocuments({ action: 'entitlement.revoked' }), 1);
  const event = await Audit.findOne({ action: 'entitlement.revoked' }).lean();
  assert.equal(event.before.grants[0].revokedAt, null);
  assert.ok(event.after.grants[0].revokedAt);
  const control = { grants: [{ _id: 'grant', features: ['ownerMobileAccess'], startsAt: '2027-02-01', endsAt: '2027-03-01' }] };
  assert.equal(evaluateEntitlements({ control, now: new Date('2027-01-31') }).features.ownerMobileAccess, false);
  assert.equal(evaluateEntitlements({ control, now: future }).features.ownerMobileAccess, true);
  assert.equal(evaluateEntitlements({ control, now: new Date('2027-03-01') }).features.ownerMobileAccess, false);
});
test('audit failure rolls back a control change rather than leaving an unrecorded platform switch', async () => {
  const before = await service.readPlatform();
  const original = Audit.create;
  Audit.create = async () => { throw new Error('acceptance audit failure'); };
  try {
    await assert.rejects(service.savePlatform(admin.id, { revision: before.revision, reason: 'Atomic audit acceptance', features: { repTracking: false } }), /acceptance audit failure/);
  } finally { Audit.create = original; }
  assert.deepEqual(await service.readPlatform(), before);
});
test('a warehouse preference cannot self-grant access after campaign expiry', () => {
  const result = evaluateEntitlements({ now: future, control: { configuration: { loyalty: true }, grants: [] } });
  assert.equal(result.features.loyalty, false);
  assert.equal(result.decisions.loyalty.reason, 'no_entitlement');
  assert.equal(result.core.paymentRecording, true);
});
test('legacy subscription HTTP writes require a revision and cannot overwrite a newer configuration', async () => {
  const path = `/admin/warehouses/${wh.id}/subscription`;
  assert.equal((await req(admin, path, 'PUT', { features: { loyalty: false } })).status, 409);
  const first = await req(admin, path, 'PUT', { revision: 0, features: { loyalty: false } });
  assert.equal(first.status, 200);
  const stale = await req(admin, path, 'PUT', { revision: 0, features: { loyalty: true } });
  assert.equal(stale.status, 409);
  assert.equal((await req(admin, path)).body.configuration.features.loyalty, false);
});
test('commission policy API is an administrator-only calculation and creates no financial records', async () => {
  const LedgerEntry = require('../src/models/ledgerEntry.model');
  const Payment = require('../src/models/payment.model');
  const before = [await LedgerEntry.countDocuments({}), await Payment.countDocuments({})];
  const input = { collection: { terms: { invoiceSyp: 100000, originalCommissionSyp: 2000,
    areaType: 'city_ring', contractRef: 'acceptance-only' }, collectedSyp: 40000, collector: 'feniq' } };
  assert.equal((await req(owner, '/admin/commission-policy-preview', 'POST', input)).status, 403);
  const result = await req(admin, '/admin/commission-policy-preview', 'POST', input);
  assert.equal(result.status, 200);
  assert.equal(result.body.cumulative.feniqSyp, 800);
  assert.equal(result.body.persisted, false);
  assert.deepEqual([await LedgerEntry.countDocuments({}), await Payment.countDocuments({})], before);
});
