const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { ACTIONS } = require('../src/utils/collectionActorPolicy');
const { authorizePersistedCollectionAction } = require('../src/utils/collectionActorAuthorization');

function fixture({ status = 'active', warehouseActive = true, grantActive = true, revokedAt = null } = {}) {
  const actorId = new Types.ObjectId(), warehouseId = new Types.ObjectId();
  const session = {};
  const actor = { _id: actorId, status };
  const warehouse = { _id: warehouseId, isActive: warehouseActive };
  const calls = [];
  const chain = value => ({ session(s) { assert.equal(s, session); return { lean: async () => value }; } });
  const User = { findById(id) { assert.equal(id, actorId); return chain(actor); } };
  const Warehouse = { findById(id) { assert.equal(id, warehouseId); return chain(warehouse); } };
  const CollectionActorGrant = { find(filter) {
    calls.push(filter);
    return chain(grantActive ? [{ actorId, warehouseId, action: ACTIONS.RECORD_FENIQ, active: true, revokedAt }] : []);
  } };
  return { actorId, warehouseId, session, User, Warehouse, CollectionActorGrant, calls };
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
