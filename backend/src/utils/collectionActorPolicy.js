'use strict';

// Pure authorization gate for the forthcoming collection writer.
// Callers MUST load actor and grants from the database after authentication;
// never pass request-body roles/grants. This does not approve or post money.
const ACTIONS = Object.freeze({
  RECORD_FENIQ: 'record_feniq',
  APPROVE_FENIQ: 'approve_feniq',
  RECORD_WAREHOUSE: 'record_warehouse',
  APPROVE_WAREHOUSE: 'approve_warehouse',
  CONFIRM_REMITTANCE: 'confirm_remittance',
});

// MongoDB ObjectIds are objects: comparing them by reference silently rejects
// valid DB-loaded grants. Normalize only nonempty string/ObjectId identities;
// never accept arbitrary objects or request-supplied authorization data.
function identity(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (value && typeof value === 'object' && value._bsontype === 'ObjectId' &&
      typeof value.toHexString === 'function') return value.toHexString();
  return null;
}

function authorizedCollectionAction({ actor, grants, action, warehouseId, recordedBy }) {
  if (!actor || actor.status !== 'active' || !identity(actor.id) || !identity(warehouseId) ||
      !Object.values(ACTIONS).includes(action) || !Array.isArray(grants)) return false;
  const eligible = grants.some(grant =>
    grant && grant.active === true && !grant.revokedAt && identity(grant.actorId) === identity(actor.id) &&
    identity(grant.warehouseId) === identity(warehouseId) && grant.action === action
  );
  if (!eligible) return false;
  // Recording and approval must be performed by distinct principals.
  if ((action === ACTIONS.APPROVE_FENIQ || action === ACTIONS.APPROVE_WAREHOUSE) &&
      (!identity(recordedBy) || identity(recordedBy) === identity(actor.id))) return false;
  return true;
}

module.exports = { ACTIONS, authorizedCollectionAction };
