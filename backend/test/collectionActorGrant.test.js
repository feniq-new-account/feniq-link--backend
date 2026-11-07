const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Grant = require('../src/models/collectionActorGrant.model');
const { ACTIONS } = require('../src/utils/collectionActorPolicy');

const actorId = new mongoose.Types.ObjectId();
const warehouseId = new mongoose.Types.ObjectId();
const make = (overrides = {}) => new Grant({ actorId, warehouseId, action: ACTIONS.RECORD_FENIQ, ...overrides });

test('new collection grants default inactive and require a known action', async () => {
  const grant = make();
  assert.equal(grant.active, false);
  assert.equal(grant.validateSync(), undefined);
  assert.ok(make({ action: 'admin_override' }).validateSync());
  assert.ok(make({ actorId: undefined }).validateSync());
  assert.ok(make({ warehouseId: undefined }).validateSync());
});

test('grant identity fields are immutable', () => {
  for (const field of ['actorId', 'warehouseId', 'action']) {
    assert.equal(Grant.schema.path(field).options.immutable, true);
  }
});

test('grant identity has a unique compound index', () => {
  assert.ok(Grant.schema.indexes().some(([fields, options]) =>
    fields.actorId === 1 && fields.warehouseId === 1 && fields.action === 1 && options.unique === true));
});
