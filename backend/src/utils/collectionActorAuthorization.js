'use strict';

const { ACTIONS, authorizedCollectionAction, canGrantToActor } = require('./collectionActorPolicy');

// Database-backed authorization boundary. Only server-resolved authenticated
// identities and persisted grants may be supplied; never pass request-body
// role, actor, warehouse or grant objects to this function.
async function authorizePersistedCollectionAction({
  actorId, warehouseId, action, recordedBy,
  User, Warehouse, CollectionActorGrant, session, forMoneyPost = false,
}) {
  if (!actorId || !warehouseId || !User || !Warehouse || !CollectionActorGrant || !session ||
      typeof forMoneyPost !== 'boolean' ||
      !Object.values(ACTIONS).includes(action)) return false;
  // A financial writer must use the exact transaction that will post money.
  // A read-only permission check deliberately remains a pure read.
  if (forMoneyPost && (!session.inTransaction || !session.inTransaction())) return false;
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
  const allowed = authorizedCollectionAction({
    actor: { id: actor._id, status: actor.status },
    warehouseId: warehouse._id, action, recordedBy, grants,
  });
  if (!allowed || !forMoneyPost) return allowed;

  // Snapshot reads alone cannot prevent a concurrent grant revocation from
  // committing before this transaction posts money. Touch the SAME grant
  // document that revoke() updates, inside the SAME payment transaction.
  // MongoDB raises a write conflict if the revocation won the race; the entire
  // financial transaction then retries and sees the revoked grant (fail closed).
  // A write that commits first serializes before any subsequent revocation.
  const grant = grants.find(g => g && g.active === true && !g.revokedAt &&
    String(g.actorId) === String(actor._id) && String(g.warehouseId) === String(warehouse._id) &&
    g.action === action);
  if (!grant || !grant._id) return false;
  const result = await CollectionActorGrant.updateOne({
    _id: grant._id, actorId: actor._id, warehouseId: warehouse._id,
    action, active: true, revokedAt: null,
  }, { $inc: { authorizationRevision: 1 } }, { session });
  return result.matchedCount === 1;
}

module.exports = { authorizePersistedCollectionAction };
