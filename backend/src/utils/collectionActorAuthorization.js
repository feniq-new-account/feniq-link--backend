'use strict';

const { ACTIONS, authorizedCollectionAction, canGrantToActor } = require('./collectionActorPolicy');

// Database-backed authorization boundary. Only server-resolved authenticated
// identities and persisted grants may be supplied; never pass request-body
// role, actor, warehouse or grant objects to this function.
async function authorizePersistedCollectionAction({
  actorId, warehouseId, action, recordedBy,
  User, Warehouse, CollectionActorGrant, session,
}) {
  if (!actorId || !warehouseId || !User || !Warehouse || !CollectionActorGrant || !session ||
      !Object.values(ACTIONS).includes(action)) return false;
  // MongoDB transactions do not support concurrent operations on one session.
  // Read sequentially to keep the authorization check transaction-safe.
  const actor = await User.findById(actorId).session(session).lean();
  if (!actor || actor.status !== 'active') return false;
  const warehouse = await Warehouse.findById(warehouseId).session(session).lean();
  if (!warehouse || !canGrantToActor(action, actor, warehouse)) return false;
  const grants = await CollectionActorGrant.find({
    actorId: actor._id, warehouseId: warehouse._id, action,
    active: true, revokedAt: null,
  }).session(session).lean();
  return authorizedCollectionAction({
    actor: { id: actor._id, status: actor.status },
    warehouseId: warehouse._id, action, recordedBy, grants,
  });
}

module.exports = { authorizePersistedCollectionAction };
