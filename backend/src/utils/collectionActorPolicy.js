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

function authorizedCollectionAction({ actor, grants, action, warehouseId, recordedBy }) {
  if (!actor || actor.status !== 'active' || !actor.id || !warehouseId ||
      !Object.values(ACTIONS).includes(action) || !Array.isArray(grants)) return false;
  const eligible = grants.some(grant =>
    grant && grant.active === true && grant.actorId === actor.id &&
    grant.warehouseId === warehouseId && grant.action === action
  );
  if (!eligible) return false;
  // Recording and approval must be performed by distinct principals.
  if ((action === ACTIONS.APPROVE_FENIQ || action === ACTIONS.APPROVE_WAREHOUSE) &&
      (!recordedBy || recordedBy === actor.id)) return false;
  return true;
}

module.exports = { ACTIONS, authorizedCollectionAction };
