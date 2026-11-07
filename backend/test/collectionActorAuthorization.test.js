const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { ACTIONS } = require('../src/utils/collectionActorPolicy');
const { authorizePersistedCollectionAction } = require('../src/utils/collectionActorAuthorization');

function fixture({ status = 'active', role = 'admin', warehouseRole = null,
  warehouseActive = true, grantActive = true, revokedAt = null, associated = true,
  grantAction = ACTIONS.RECORD_FENIQ } = {}) {
  const actorId = new Types.ObjectId(), warehouseId = new Types.ObjectId();
  const session = { inTransaction: () => true };
  const actor = { _id: actorId, status, role, warehouseRole };
  const warehouse = { _id: warehouseId, isActive: warehouseActive,
    userId: associated ? actorId : new Types.ObjectId(), memberUserIds: [] };
  const calls = [];
  const chain = value => ({ session(s) { assert.equal(s, session); return { lean: async () => value }; } });
  const User = { findById(id) { assert.equal(id, actorId); return chain(actor); } };
  const Warehouse = { findById(id) { assert.equal(id, warehouseId); return chain(warehouse); } };
  const grantId = new Types.ObjectId();
  const writes = [];
  const CollectionActorGrant = {
    find(filter) {
      calls.push(filter);
      return chain(grantActive ? [{ _id: grantId, actorId, warehouseId,
        action: grantAction, active: true, revokedAt }] : []);
    },
    async updateOne(filter, update, options) {
      writes.push({ filter, update, options });
      assert.equal(options.session, session);
      return { matchedCount: grantActive && !revokedAt ? 1 : 0 };
    },
  };
  return { actorId, warehouseId, session, User, Warehouse, CollectionActorGrant, calls, writes, grantId };
}

test('loads persisted scoped grants using the caller transaction session', async () => {
  const f = fixture();
  assert.equal(await authorizePersistedCollectionAction({ ...f, action: ACTIONS.RECORD_FENIQ }), true);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], { actorId: f.actorId, warehouseId: f.warehouseId,
    action: ACTIONS.RECORD_FENIQ, active: true, revokedAt: null });
});

test('fails closed for inactive actor, inactive warehouse and absent grants', async () => {
  for (const opts of [{ status: 'blocked' }, { warehouseActive: false }, { grantActive: false }]) {
    const f = fixture(opts);
    assert.equal(await authorizePersistedCollectionAction({ ...f, action: ACTIONS.RECORD_FENIQ }), false);
  }
});

test('rejects revoked grant and missing transaction session', async () => {
  const f = fixture({ revokedAt: new Date() });
  assert.equal(await authorizePersistedCollectionAction({ ...f, action: ACTIONS.RECORD_FENIQ }), false);
  assert.equal(await authorizePersistedCollectionAction({ ...f, session: null, action: ACTIONS.RECORD_FENIQ }), false);
});

test('never accepts collection approval from a recorder with the same identity', async () => {
  const f = fixture();
  assert.equal(await authorizePersistedCollectionAction({
    ...f, action: ACTIONS.APPROVE_FENIQ, recordedBy: f.actorId,
  }), false);
});

test('serializes database reads sharing one MongoDB transaction session', async () => {
  const f = fixture();
  let pending = false;
  const events = [];
  const guarded = (label, value) => ({
    session(s) {
      assert.equal(s, f.session);
      return { async lean() {
        assert.equal(pending, false, 'parallel query on one transaction session');
        pending = true;
        events.push(label);
        await Promise.resolve();
        pending = false;
        return value;
      } };
    },
  });
  const User = { findById: () => guarded('actor', { _id: f.actorId, status: 'active', role: 'admin' }) };
  const Warehouse = { findById: () => guarded('warehouse', { _id: f.warehouseId, isActive: true }) };
  const CollectionActorGrant = { find: () => guarded('grant', [{
    actorId: f.actorId, warehouseId: f.warehouseId, action: ACTIONS.RECORD_FENIQ,
    active: true, revokedAt: null,
  }]) };
  assert.equal(await authorizePersistedCollectionAction({
    ...f, User, Warehouse, CollectionActorGrant, action: ACTIONS.RECORD_FENIQ,
  }), true);
  assert.deepEqual(events, ['actor', 'warehouse', 'grant']);
});

test('rejects unknown collection actions without querying authorization records', async () => {
  const f = fixture();
  const User = { findById() { throw new Error('unexpected database read'); } };
  assert.equal(await authorizePersistedCollectionAction({
    ...f, User, action: 'approve_anything',
  }), false);
  assert.equal(f.calls.length, 0);
});

test('role and warehouse membership are rechecked when using a persisted grant', async () => {
  for (const opts of [
    { role: 'rep' },
    { role: 'warehouse', warehouseRole: 'owner', grantAction: ACTIONS.RECORD_WAREHOUSE },
    { role: 'warehouse', warehouseRole: 'accountant',
      associated: false, grantAction: ACTIONS.RECORD_WAREHOUSE },
  ]) {
    const f = fixture(opts);
    assert.equal(await authorizePersistedCollectionAction({
      ...f, action: opts.grantAction || ACTIONS.RECORD_FENIQ,
    }), false);
    assert.equal(f.calls.length, 0, 'ineligible actor must not read an active grant');
  }
  const f = fixture({ role: 'warehouse', warehouseRole: 'accountant',
    grantAction: ACTIONS.RECORD_WAREHOUSE });
  assert.equal(await authorizePersistedCollectionAction({
    ...f, action: ACTIONS.RECORD_WAREHOUSE,
  }), true);
});


test('money-post authorization touches the grant in the posting transaction', async () => {
  const f = fixture();
  assert.equal(await authorizePersistedCollectionAction({
    ...f, action: ACTIONS.RECORD_FENIQ, forMoneyPost: true,
  }), true);
  assert.equal(f.writes.length, 1);
  assert.equal(String(f.writes[0].filter._id), String(f.grantId));
  assert.deepEqual(f.writes[0].update, { $inc: { authorizationRevision: 1 } });
  assert.equal(f.writes[0].filter.active, true);
  assert.equal(f.writes[0].filter.revokedAt, null);
  assert.equal(f.writes[0].options.session, f.session);
});

test('read-only authorization never writes grant, and money-post fails closed without transaction', async () => {
  const f = fixture();
  assert.equal(await authorizePersistedCollectionAction({
    ...f, action: ACTIONS.RECORD_FENIQ,
  }), true);
  assert.equal(f.writes.length, 0);
  assert.equal(await authorizePersistedCollectionAction({
    ...f, action: ACTIONS.RECORD_FENIQ, forMoneyPost: true,
    session: { inTransaction: () => false },
  }), false);
  assert.equal(f.writes.length, 0);
});

test('money-post authorization denies a grant lost before the conditional write', async () => {
  const f = fixture();
  f.CollectionActorGrant.updateOne = async () => ({ matchedCount: 0 });
  assert.equal(await authorizePersistedCollectionAction({
    ...f, action: ACTIONS.RECORD_FENIQ, forMoneyPost: true,
  }), false);
});
