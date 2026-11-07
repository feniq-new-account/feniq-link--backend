const test = require('node:test');
const assert = require('node:assert/strict');
const { ACTIONS, authorizedCollectionAction } = require('../src/utils/collectionActorPolicy');

const actor = { id: 'accountant-a', status: 'active', role: 'admin' };
const warehouseId = 'warehouse-a';
const grant = action => ({ actorId: actor.id, warehouseId, action, active: true });
const can = (action, overrides = {}) => authorizedCollectionAction({
  actor, grants: [grant(action)], warehouseId, action, recordedBy: 'collector-b', ...overrides,
});

test('explicit persisted grant is required, even for a generic admin', () => {
  assert.equal(can(ACTIONS.APPROVE_WAREHOUSE), true);
  assert.equal(can(ACTIONS.APPROVE_WAREHOUSE, { grants: [] }), false);
  assert.equal(can(ACTIONS.APPROVE_WAREHOUSE, { grants: [{ ...grant(ACTIONS.APPROVE_WAREHOUSE), active: false }] }), false);
  assert.equal(can(ACTIONS.APPROVE_WAREHOUSE, { actor: { ...actor, status: 'blocked' } }), false);
  assert.equal(can(ACTIONS.APPROVE_WAREHOUSE, { warehouseId: 'warehouse-b' }), false);
});

test('grant scope and action are exact; no cross-warehouse or cross-path approval', () => {
  assert.equal(can(ACTIONS.APPROVE_FENIQ, { grants: [grant(ACTIONS.APPROVE_WAREHOUSE)] }), false);
  assert.equal(can(ACTIONS.RECORD_FENIQ, { grants: [grant(ACTIONS.APPROVE_FENIQ)] }), false);
  assert.equal(can(ACTIONS.APPROVE_WAREHOUSE, { grants: [{ ...grant(ACTIONS.APPROVE_WAREHOUSE), actorId: 'someone-else' }] }), false);
  assert.equal(can('admin_override'), false);
});

test('collector cannot approve own receipt, even with explicit approval grant', () => {
  assert.equal(can(ACTIONS.APPROVE_FENIQ, { recordedBy: actor.id }), false);
  assert.equal(can(ACTIONS.APPROVE_WAREHOUSE, { recordedBy: null }), false);
  assert.equal(can(ACTIONS.APPROVE_WAREHOUSE, { recordedBy: 'collector-b' }), true);
});

test('recording and custody confirmation require separate explicit actions', () => {
  assert.equal(can(ACTIONS.RECORD_FENIQ), true);
  assert.equal(can(ACTIONS.RECORD_WAREHOUSE, { grants: [grant(ACTIONS.RECORD_FENIQ)] }), false);
  assert.equal(can(ACTIONS.CONFIRM_REMITTANCE, { grants: [grant(ACTIONS.APPROVE_FENIQ)] }), false);
});

test('MongoDB ObjectIds from persisted grants match by value, not object reference', () => {
  const { Types } = require('mongoose');
  const actorId = new Types.ObjectId();
  const scopeId = new Types.ObjectId();
  const collectorId = new Types.ObjectId();
  const stored = { actorId: new Types.ObjectId(actorId.toHexString()),
    warehouseId: new Types.ObjectId(scopeId.toHexString()),
    action: ACTIONS.APPROVE_FENIQ, active: true };
  const args = { actor: { id: actorId, status: 'active' }, warehouseId: scopeId,
    grants: [stored], action: ACTIONS.APPROVE_FENIQ, recordedBy: collectorId };
  assert.equal(authorizedCollectionAction(args), true);
  assert.equal(authorizedCollectionAction({ ...args, recordedBy: new Types.ObjectId(actorId.toHexString()) }), false);
  assert.equal(authorizedCollectionAction({ ...args, warehouseId: new Types.ObjectId() }), false);
  assert.equal(authorizedCollectionAction({ ...args, grants: [{ ...stored, actorId: {} }] }), false);
});
