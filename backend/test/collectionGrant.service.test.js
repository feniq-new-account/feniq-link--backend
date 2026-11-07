const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Grant = require('../src/models/collectionActorGrant.model');
const audit = require('../src/services/financialAudit.service');
const service = require('../src/services/collectionGrant.service');
const { ACTIONS, canGrantToActor } = require('../src/utils/collectionActorPolicy');

const ID = {
  grantor: '111111111111111111111111',
  target: '222222222222222222222222',
  warehouse: '333333333333333333333333',
  other: '444444444444444444444444',
  grant: '555555555555555555555555',
};
const query = value => ({
  select() { return this; }, sort() { return this; }, limit() { return this; },
  session() { return this; }, async lean() { return value; },
});

function fakeDb(t, { targetRole = 'admin', warehouseRole = null, active = true } = {}) {
  const grants = [];
  const audits = [];
  const session = {
    financialOperationAt: null,
    async withTransaction(work) { await work(); },
    async endSession() {},
  };
  t.mock.method(mongoose, 'startSession', async () => session);
  t.mock.method(User, 'findById', id => query(
    String(id) === ID.grantor ? { _id: ID.grantor, role: 'admin', status: 'active' } :
    String(id) === ID.target ? { _id: ID.target, role: targetRole,
      warehouseRole, status: active ? 'active' : 'blocked' } : null));
  t.mock.method(Warehouse, 'findById', id => query(
    String(id) === ID.warehouse ? {
      _id: ID.warehouse, userId: ID.other, memberUserIds: [ID.target], isActive: true,
    } : null));
  t.mock.method(Grant, 'findOne', filter => query(grants.find(g =>
    Object.keys(filter).every(key => String(g[key]) === String(filter[key]))) || null));
  t.mock.method(Grant, 'find', filter => query(grants.filter(g =>
    String(g.warehouseId) === String(filter.warehouseId))));
  t.mock.method(Grant, 'create', async ([payload], opts) => {
    assert.equal(opts.session, session);
    const row = { ...payload, _id: ID.grant, createdAt: new Date() };
    grants.push(row);
    return [row];
  });
  t.mock.method(Grant, 'findOneAndUpdate', (filter, update, opts) => {
    assert.equal(opts.session, session);
    const row = grants.find(g => String(g._id) === String(filter._id) &&
      String(g.warehouseId) === String(filter.warehouseId) && g.active === true && !g.revokedAt);
    if (!row) return query(null);
    Object.assign(row, update.$set);
    return query(row);
  });
  t.mock.method(audit, 'record', async (event, auditSession) => {
    assert.equal(auditSession, session);
    audits.push(event);
  });
  return { grants, audits };
}

test('only explicitly eligible current actors can hold collection grants', () => {
  const warehouse = { isActive: true, userId: ID.other, memberUserIds: [ID.target] };
  assert.equal(canGrantToActor(ACTIONS.RECORD_FENIQ,
    { _id: ID.target, role: 'rep', status: 'active' }, warehouse), false);
  assert.equal(canGrantToActor(ACTIONS.APPROVE_FENIQ,
    { _id: ID.target, role: 'admin', status: 'active' }, warehouse), true);
  assert.equal(canGrantToActor(ACTIONS.APPROVE_WAREHOUSE,
    { _id: ID.target, role: 'warehouse', warehouseRole: 'accountant', status: 'active' }, warehouse), true);
  assert.equal(canGrantToActor(ACTIONS.APPROVE_WAREHOUSE,
    { _id: ID.other, role: 'warehouse', warehouseRole: 'accountant', status: 'active' }, warehouse), true);
  assert.equal(canGrantToActor(ACTIONS.RECORD_WAREHOUSE,
    { _id: '666666666666666666666666', role: 'warehouse', warehouseRole: 'accountant', status: 'active' }, warehouse), false);
  assert.equal(canGrantToActor(ACTIONS.RECORD_WAREHOUSE,
    { _id: ID.target, role: 'warehouse', warehouseRole: 'owner', status: 'active' }, warehouse), false);
});

test('grant issuance is transactional, audited, idempotent and rejects key collisions', async t => {
  const db = fakeDb(t);
  const request = { actorId: ID.target, action: ACTIONS.APPROVE_FENIQ,
    reason: 'Operational approval', idempotencyKey: 'grant-unique-1' };
  const first = await service.issue(ID.grantor, ID.warehouse, request);
  assert.equal(first.replay, false);
  assert.equal(first.grant.active, true);
  assert.equal(db.grants.length, 1);
  assert.equal(db.audits.length, 1);
  assert.equal(db.audits[0].action, 'collection.grant_issued');
  const retry = await service.issue(ID.grantor, ID.warehouse, request);
  assert.equal(retry.replay, true);
  assert.equal(db.grants.length, 1);
  assert.equal(db.audits.length, 1);
  await assert.rejects(service.issue(ID.grantor, ID.warehouse,
    { ...request, reason: 'Different approval' }), { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
});

test('grant revocation persists once and cannot be silently un-revoked', async t => {
  const db = fakeDb(t);
  await service.issue(ID.grantor, ID.warehouse, {
    actorId: ID.target, action: ACTIONS.RECORD_FENIQ, reason: 'Initial grant',
    idempotencyKey: 'grant-unique-2',
  });
  const body = { reason: 'Access withdrawn', idempotencyKey: 'revoke-unique-2' };
  const removed = await service.revoke(ID.grantor, ID.warehouse, ID.grant, body);
  assert.equal(removed.grant.active, false);
  assert.ok(removed.grant.revokedAt);
  assert.equal(db.audits[1].action, 'collection.grant_revoked');
  const retry = await service.revoke(ID.grantor, ID.warehouse, ID.grant, body);
  assert.equal(retry.replay, true);
  assert.equal(db.audits.length, 2);
  await assert.rejects(service.revoke(ID.grantor, ID.warehouse, ID.grant,
    { ...body, idempotencyKey: 'new-revoke-key' }), { statusCode: 409, code: 'COLLECTION_GRANT_REVOKED' });
});

test('warehouse collection grant refuses unrelated and non-accountant users without audit or write', async t => {
  const db = fakeDb(t, { targetRole: 'warehouse', warehouseRole: 'owner' });
  await assert.rejects(service.issue(ID.grantor, ID.warehouse, {
    actorId: ID.target, action: ACTIONS.APPROVE_WAREHOUSE,
    reason: 'Invalid scope', idempotencyKey: 'grant-denied',
  }), { statusCode: 403, code: 'COLLECTION_GRANT_SCOPE_DENIED' });
  assert.equal(db.grants.length, 0);
  assert.equal(db.audits.length, 0);
});

test('grant schema defines unique issuance and revocation idempotency keys', () => {
  const indexes = Grant.schema.indexes();
  for (const key of ['issuanceKey', 'revocationKey']) {
    assert.ok(indexes.some(([fields, options]) => fields.warehouseId === 1 &&
      fields[key] === 1 && options.unique === true && options.sparse === true));
  }
});
