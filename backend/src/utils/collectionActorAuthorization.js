'use strict';

const { authorizedCollectionAction } = require('./collectionActorPolicy');

// Database-backed authorization boundary. Only server-resolved authenticated
// identities and persisted grants may be supplied; never pass request-body
// role, actor, warehouse or grant objects to this function.
async function authorizePersistedCollectionAction({
  actorId, warehouseId, action, recordedBy,
  User, Warehouse, CollectionActorGrant, session,
}) {
  if (!actorId || !warehouseId || !User || !Warehouse || !CollectionActorGrant || !session) return false;
  const [actor, warehouse] = await Promise.all([
    User.findById(actorId).session(session).lean(),
    Warehouse.findById(warehouseId).session(session).lean(),
  ]);
  if (!actor || actor.status !== 'active' || !warehouse || warehouse.isActive !== true) return false;
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
