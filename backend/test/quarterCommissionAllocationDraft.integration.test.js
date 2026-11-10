process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'synthetic-quarter-draft-admin-test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const PlatformSetting = require('../src/models/platformSetting.model');
const FinancialAuditLog = require('../src/models/financialAuditLog.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const { Event, Invoice } = require('../src/models/collectionAccounting.model');
const { collectionEntitlement } = require('../src/utils/collectionCommissionPolicy');

let server, base, admin, warehouse, blocked;
const plan = {
  city: { feniqToPharmacyBps: 0, repToPharmacyBps: 5000 },
  outside: { feniqToPharmacyBps: 2500 },
};
test.before(async () => {
  await startMemoryMongo({ dbName: 'quarter-draft-integration', orderingOpen: false });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
  admin = await User.create({ name: 'Fictional admin', phone: '0991111100',
    role: 'admin', status: 'active' });
  warehouse = await User.create({ name: 'Fictional warehouse', phone: '0991111101',
    role: 'warehouse', warehouseRole: 'accountant', status: 'active' });
  blocked = await User.create({ name: 'Fictional blocked admin', phone: '0991111102',
    role: 'admin', status: 'blocked' });
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});
async function call(actor, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (actor) headers.Authorization = 'Bearer ' + jwt.sign({ sub: String(actor._id) },
    env.jwtSecret, { expiresIn: '1h' });
  const response = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const basePath = '/admin/commission/allocation-draft';

test('admin staged policy: defaults, access control, audited save, preview, stale revision and unchanged money ledgers', async () => {
  const unauthenticated = await call(null, 'GET', basePath);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await call(warehouse, 'GET', basePath)).status, 403);
  assert.equal((await call(blocked, 'GET', basePath)).status, 403);
  const initial = await call(admin, 'GET', basePath);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.allocation.revision, 0);
  assert.equal(initial.body.allocation.draftOnly, true);
  assert.equal(initial.body.allocation.appliesToLiveAccounting, false);
  assert.equal(initial.body.allocation.plan.city.repToPharmacyBps, 0);

  const preview = await call(admin, 'POST', basePath + '/preview', {
    plan, invoiceSyp: 100000, originalCommissionSyp: 10000,
    eligibleCollectedSyp: 100000,
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.previewOnly, true);
  assert.equal(preview.body.persisted, false);
  assert.equal(preview.body.noCashOrCreditPosted, true);
  assert.deepEqual([
    preview.body.city.earned.feniqSyp,
    preview.body.city.earned.repSyp,
    preview.body.city.earned.pharmacySyp,
  ], [5000, 2500, 2500]);
  assert.deepEqual([
    preview.body.outside.earned.feniqSyp,
    preview.body.outside.earned.repSyp,
    preview.body.outside.earned.pharmacySyp,
  ], [7500, 0, 2500]);

  const payload = { revision: 0, reason: 'Synthetic owner approved future draft allocation', plan };
  const unauthorisedWrite = await call(warehouse, 'PUT', basePath, payload);
  assert.equal(unauthorisedWrite.status, 403);
  const saved = await call(admin, 'PUT', basePath, payload);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.allocation.revision, 1);
  assert.equal(saved.body.allocation.draftOnly, true);
  const fresh = await call(admin, 'GET', basePath);
  assert.deepEqual(fresh.body.allocation.plan, plan);
  assert.equal((await call(admin, 'PUT', basePath, payload)).status, 409);

  const audit = await FinancialAuditLog.find({ action: 'commission.quarter_draft_saved' }).lean();
  assert.equal(audit.length, 1);
  assert.equal(String(audit[0].actorId), String(admin._id));
  assert.equal(audit[0].after.revision, 1);
  assert.equal(await PlatformSetting.countDocuments({ key: 'commissionQuarterAllocationDraft' }), 1);
  assert.equal(await Order.countDocuments(), 0);
  assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await Event.countDocuments(), 0);
  assert.equal(await Invoice.countDocuments(), 0);

  // Not coupled to live v2 posting or the older fixed-split preview:
  const existing = collectionEntitlement({
    invoiceSyp: 100000, originalCommissionSyp: 10000,
    areaType: 'city', contractRef: 'unchanged-real-policy',
  }, 100000);
  assert.equal(existing.feniqSyp, 5000);
  assert.equal(existing.repSyp, 5000);
  assert.equal(existing.pharmacySyp, 0);
});

test('draft rejects malformed percentages, hidden write flags, invalid reasons and unexpected input', async () => {
  for (const body of [
    { revision: 1, reason: 'synthetic valid reason', plan: {
      city: { feniqToPharmacyBps: 0, repToPharmacyBps: 25000 },
      outside: plan.outside,
    } },
    { revision: 1, reason: 'x', plan },
    { revision: 1, reason: 'synthetic valid reason', plan, activateLive: true },
    { revision: 0, reason: 'synthetic valid reason', plan },
  ]) {
    const result = await call(admin, 'PUT', basePath, body);
    assert.ok([400, 409].includes(result.status));
  }
  assert.equal((await call(admin, 'POST', basePath + '/preview', {
    plan, invoiceSyp: 100, originalCommissionSyp: 30,
    eligibleCollectedSyp: 120,
  })).status, 400);
  assert.equal((await call(admin, 'POST', basePath + '/preview', {
    plan, invoiceSyp: 100, originalCommissionSyp: 30,
    eligibleCollectedSyp: 50, secretlyPostLedger: true,
  })).status, 400);
});
