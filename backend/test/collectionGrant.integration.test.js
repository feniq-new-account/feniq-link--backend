process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'synthetic-collection-grants-test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Grant = require('../src/models/collectionActorGrant.model');
const Audit = require('../src/models/financialAuditLog.model');
const Payment = require('../src/models/payment.model');
const Entry = require('../src/models/ledgerEntry.model');
const ledger = require('../src/services/ledger.service');
const { runInTransaction } = require('../src/utils/transaction');
const { authorizePersistedCollectionAction } = require('../src/utils/collectionActorAuthorization');
const { ACTIONS } = require('../src/utils/collectionActorPolicy');

let server, base, admin, secondAdmin, owner, accountant, warehouse;
const tokens = [];
test.before(async () => {
  await startMemoryMongo({ dbName: 'collection-grants-isolated', orderingOpen: true });
  await ledger.ensureFinancialIndexes();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});
test.beforeEach(async () => {
  for (const col of await mongoose.connection.db.collections()) await col.deleteMany({});
  [admin, secondAdmin, owner, accountant] = await User.create([
    { name: 'Synthetic grant admin', phone: '0987000001', role: 'admin', status: 'active' },
    { name: 'Synthetic collector admin', phone: '0987000002', role: 'admin', status: 'active' },
    { name: 'Synthetic owner', phone: '0987000003', role: 'warehouse', warehouseRole: 'owner', status: 'active' },
    { name: 'Synthetic accountant', phone: '0987000004', role: 'warehouse', warehouseRole: 'accountant', status: 'active' },
  ]);
  warehouse = await Warehouse.create({
    userId: owner._id, memberUserIds: [accountant._id],
    nameAr: 'مستودع تجريبي', nameEn: 'Synthetic Warehouse', city: 'Latakia',
    address: 'Only synthetic data', phone: '0987000003', isActive: true,
  });
});
async function call(actor, method, path, body) {
  const token = actor && jwt.sign({ sub: String(actor._id) }, env.jwtSecret, { expiresIn: '1h' });
  const response = await fetch(base + path, { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, replay: response.headers.get('Idempotent-Replay'),
    body: await response.json() };
}
function route() { return '/admin/collection-accounting/warehouses/' + warehouse._id + '/actor-grants'; }
const reason = 'Synthetic authorized cash handling';
function issueBody(actor, action, key) {
  return { actorId: String(actor._id), action, reason, idempotencyKey: key };
}

test('scoped issue/list/revoke is audited and idempotent without touching ledger or cash', async () => {
  const path = route();
  const body = issueBody(secondAdmin, ACTIONS.APPROVE_FENIQ, 'synthetic-grant-key');
  assert.equal((await call(null, 'POST', path, body)).status, 401);
  assert.equal((await call(owner, 'POST', path, body)).status, 403);

  const issued = await call(admin, 'POST', path, body);
  assert.equal(issued.status, 201);
  assert.equal(issued.body.grant.active, true);
  assert.equal((await call(admin, 'POST', path, body)).replay, 'true');
  assert.equal((await call(admin, 'POST', path, { ...body, reason: 'Changed' })).status, 409);
  const list = await call(admin, 'GET', path);
  assert.equal(list.status, 200);
  assert.equal(list.body.grants.length, 1);
  assert.equal((await Grant.countDocuments({ warehouseId: warehouse._id })), 1);
  assert.equal(await Audit.countDocuments({ action: 'collection.grant_issued' }), 1);
  const usable = await runInTransaction(session => authorizePersistedCollectionAction({
    actorId: secondAdmin._id, warehouseId: warehouse._id, action: ACTIONS.APPROVE_FENIQ,
    recordedBy: admin._id, User, Warehouse, CollectionActorGrant: Grant, session,
  }));
  assert.equal(usable, true);

  const revokeUrl = path + '/' + issued.body.grant.id + '/revoke';
  const revokeBody = { reason: 'Synthetic revoke', idempotencyKey: 'synthetic-revoke-key' };
  const revoked = await call(admin, 'POST', revokeUrl, revokeBody);
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.grant.active, false);
  assert.equal((await call(admin, 'POST', revokeUrl, revokeBody)).replay, 'true');
  assert.equal((await call(admin, 'POST', revokeUrl, { ...revokeBody, reason: 'Changed' })).status, 409);
  const denied = await runInTransaction(session => authorizePersistedCollectionAction({
    actorId: secondAdmin._id, warehouseId: warehouse._id, action: ACTIONS.APPROVE_FENIQ,
    recordedBy: admin._id, User, Warehouse, CollectionActorGrant: Grant, session,
  }));
  assert.equal(denied, false);
  assert.equal(await Audit.countDocuments({ action: 'collection.grant_revoked' }), 1);
  assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await Entry.countDocuments(), 0);
});

test('warehouse grant is restricted to its currently assigned accountant', async () => {
  const path = route();
  const invalid = await call(admin, 'POST', path,
    issueBody(owner, ACTIONS.APPROVE_WAREHOUSE, 'owner-is-not-accountant'));
  assert.equal(invalid.status, 403);
  const valid = await call(admin, 'POST', path,
    issueBody(accountant, ACTIONS.APPROVE_WAREHOUSE, 'warehouse-accountant-grant'));
  assert.equal(valid.status, 201);
  const deniedOtherAction = await runInTransaction(session => authorizePersistedCollectionAction({
    actorId: accountant._id, warehouseId: warehouse._id, action: ACTIONS.RECORD_FENIQ,
    User, Warehouse, CollectionActorGrant: Grant, session,
  }));
  assert.equal(deniedOtherAction, false);
  // Removing the membership revokes its effective authorization even if
  // somebody forgot to revoke the historical grant row.
  await Warehouse.updateOne({ _id: warehouse._id }, { $set: { memberUserIds: [] } });
  const stale = await runInTransaction(session => authorizePersistedCollectionAction({
    actorId: accountant._id, warehouseId: warehouse._id, action: ACTIONS.APPROVE_WAREHOUSE,
    recordedBy: admin._id, User, Warehouse, CollectionActorGrant: Grant, session,
  }));
  assert.equal(stale, false);
});

test('multiple issued grants can coexist before any revocation key is written', async () => {
  const path = route();
  const one = await call(admin, 'POST', path, issueBody(secondAdmin,
    ACTIONS.RECORD_FENIQ, 'first-grant'));
  const two = await call(admin, 'POST', path, issueBody(secondAdmin,
    ACTIONS.APPROVE_FENIQ, 'second-grant'));
  const three = await call(admin, 'POST', path, issueBody(accountant,
    ACTIONS.APPROVE_WAREHOUSE, 'third-grant'));
  assert.deepEqual([one.status, two.status, three.status], [201, 201, 201]);
  assert.equal(await Grant.countDocuments({ warehouseId: warehouse._id }), 3);
  assert.equal(await Audit.countDocuments({ action: 'collection.grant_issued' }), 3);
});

test('revocation idempotency key cannot revoke a different grant', async () => {
  const path = route();
  const first = await call(admin, 'POST', path, issueBody(secondAdmin,
    ACTIONS.RECORD_FENIQ, 'grant-revoke-a'));
  const second = await call(admin, 'POST', path, issueBody(secondAdmin,
    ACTIONS.APPROVE_FENIQ, 'grant-revoke-b'));
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  const revokeBody = { reason: 'Grant closed', idempotencyKey: 'one-revocation-key' };
  assert.equal((await call(admin, 'POST', path + '/' + first.body.grant.id + '/revoke', revokeBody)).status, 200);
  const denied = await call(admin, 'POST', path + '/' + second.body.grant.id + '/revoke', revokeBody);
  assert.equal(denied.status, 409);
  const unaffected = await Grant.findById(second.body.grant.id).lean();
  assert.equal(unaffected.active, true);
  assert.equal(await Audit.countDocuments({ action: 'collection.grant_revoked' }), 1);
});


test('revocation committed after a stale transaction read prevents financial-write authorization', async () => {
  const issued = await call(admin, 'POST', route(), issueBody(
    secondAdmin, ACTIONS.APPROVE_FENIQ, 'write-race-approval-grant',
  ));
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    // Establish an old MongoDB snapshot before revocation; this is the race
    // that a permission SELECT alone would not protect against.
    const snapshotGrant = await Grant.findById(issued.body.grant.id).session(session).lean();
    assert.equal(snapshotGrant.active, true);
    const revoke = await call(admin, 'POST',
      route() + '/' + issued.body.grant.id + '/revoke',
      { reason: 'Revoke before posting money', idempotencyKey: 'write-race-revoke-grant' });
    assert.equal(revoke.status, 200, JSON.stringify(revoke.body));

    let allowed = false;
    let rejected = false;
    try {
      allowed = await authorizePersistedCollectionAction({
        actorId: secondAdmin._id, warehouseId: warehouse._id,
        action: ACTIONS.APPROVE_FENIQ, recordedBy: admin._id,
        User, Warehouse, CollectionActorGrant: Grant, session, forMoneyPost: true,
      });
    } catch (err) {
      // MongoDB may reject the stale transaction with WriteConflict.
      // Either a conflict or an explicit false must abort the money writer.
      rejected = true;
      assert.ok(err.hasErrorLabel?.('TransientTransactionError') ||
        err.code === 112 || /write conflict|transaction/i.test(String(err.message)),
      String(err));
    }
    assert.equal(allowed, false, 'a revoked grant authorized a stale money transaction');
    assert.equal(rejected || !allowed, true);
  } finally {
    try { if (session.inTransaction()) await session.abortTransaction(); } catch { /* already aborted */ }
    await session.endSession();
  }
  assert.equal((await Grant.findById(issued.body.grant.id).lean()).active, false);
  assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await Entry.countDocuments(), 0);
});

test('money-post guard increments a live grant only inside its transaction', async () => {
  const issued = await call(admin, 'POST', route(), issueBody(
    secondAdmin, ACTIONS.APPROVE_FENIQ, 'active-guard-approval-grant',
  ));
  assert.equal(issued.status, 201);
  const before = await Grant.findById(issued.body.grant.id).lean();
  assert.equal(before.authorizationRevision, 0);
  const authorized = await runInTransaction(session => authorizePersistedCollectionAction({
    actorId: secondAdmin._id, warehouseId: warehouse._id,
    action: ACTIONS.APPROVE_FENIQ, recordedBy: admin._id,
    User, Warehouse, CollectionActorGrant: Grant, session, forMoneyPost: true,
  }));
  assert.equal(authorized, true);
  const after = await Grant.findById(issued.body.grant.id).lean();
  assert.equal(after.authorizationRevision, 1);
  assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await Entry.countDocuments(), 0);
});
