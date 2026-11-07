'use strict';

const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { requestFingerprint, idempotencyKeyReusedError } = require('../utils/idempotency');
const { runInTransaction } = require('../utils/transaction');
const { ACTIONS, canGrantToActor } = require('../utils/collectionActorPolicy');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const CollectionActorGrant = require('../models/collectionActorGrant.model');
const audit = require('./financialAudit.service');

const HEX_ID = /^[a-f0-9]{24}$/i;

function requireId(value, code) {
  if (typeof value !== 'string' || !HEX_ID.test(value)) {
    throw ApiError.badRequest('Invalid identifier.', undefined, code);
  }
  return value.toLowerCase();
}
function requireText(value, max, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw ApiError.badRequest('A nonempty field is required.', undefined, code);
  }
  return value.trim();
}
function strictBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !allowed.includes(key))) {
    throw ApiError.badRequest('Invalid collection grant request.', undefined, 'INVALID_COLLECTION_GRANT');
  }
}
async function activeAdmin(adminId, session) {
  const admin = await User.findById(adminId).select('role status').session(session).lean();
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') {
    throw ApiError.forbidden('Active platform administrator required.', 'ACTIVE_ADMIN_REQUIRED');
  }
}
async function activeWarehouse(warehouseId, session) {
  const warehouse = await Warehouse.findById(warehouseId)
    .select('isActive userId memberUserIds').session(session).lean();
  if (!warehouse || warehouse.isActive !== true) {
    throw ApiError.notFound('Active warehouse not found.', 'WAREHOUSE_NOT_FOUND');
  }
  return warehouse;
}
function present(grant) {
  return {
    id: grant._id, warehouseId: grant.warehouseId, actorId: grant.actorId,
    action: grant.action, active: grant.active === true && !grant.revokedAt,
    grantedBy: grant.grantedBy, grantedAt: grant.createdAt,
    revokedAt: grant.revokedAt || null,
  };
}
async function list(adminId, warehouseId) {
  warehouseId = requireId(warehouseId, 'INVALID_WAREHOUSE');
  return runInTransaction(async session => {
    await activeAdmin(adminId, session);
    await activeWarehouse(warehouseId, session);
    const grants = await CollectionActorGrant.find({ warehouseId })
      .sort({ createdAt: -1, _id: -1 }).limit(100).session(session).lean();
    return grants.map(present);
  });
}

async function issue(adminId, warehouseId, body) {
  warehouseId = requireId(warehouseId, 'INVALID_WAREHOUSE');
  strictBody(body, ['actorId', 'action', 'reason', 'idempotencyKey']);
  const actorId = requireId(body.actorId, 'INVALID_GRANT_ACTOR');
  const action = body.action;
  if (!Object.values(ACTIONS).includes(action)) {
    throw ApiError.badRequest('Unknown collection action.', undefined, 'INVALID_COLLECTION_ACTION');
  }
  const reason = requireText(body.reason, 500, 'COLLECTION_GRANT_REASON_REQUIRED');
  const key = requireText(body.idempotencyKey, 100, 'IDEMPOTENCY_KEY_REQUIRED');
  const fingerprint = requestFingerprint('collection-actor-issue-v1', {
    adminId: String(adminId), warehouseId, actorId, action, reason,
  });
  async function replay(session) {
    const previous = await CollectionActorGrant.findOne({ warehouseId, issuanceKey: key })
      .session(session).lean();
    if (!previous) return null;
    if (previous.issuanceFingerprint !== fingerprint) {
      throw idempotencyKeyReusedError('Collection grant key already used for another request.');
    }
    return { grant: present(previous), replay: true };
  }
  try {
    return await runInTransaction(async session => {
      await activeAdmin(adminId, session);
      const warehouse = await activeWarehouse(warehouseId, session);
      const previous = await replay(session);
      if (previous) return previous;
      const actor = await User.findById(actorId).select('role status warehouseRole').session(session).lean();
      if (!canGrantToActor(action, actor, warehouse)) {
        throw ApiError.forbidden('Collection actor is not eligible for this warehouse action.',
          'COLLECTION_GRANT_SCOPE_DENIED');
      }
      const existing = await CollectionActorGrant.findOne({ warehouseId, actorId, action })
        .session(session).lean();
      if (existing) {
        throw ApiError.conflict('Collection grant already exists; revocation is final.',
          'COLLECTION_GRANT_EXISTS');
      }
      const [grant] = await CollectionActorGrant.create([{
        warehouseId, actorId, action, active: true, grantedBy: adminId,
        grantReason: reason, issuanceKey: key, issuanceFingerprint: fingerprint,
      }], { session });
      await audit.record({
        action: 'collection.grant_issued', actorId: adminId, actorRole: 'admin',
        onBehalfOfWarehouseId: warehouseId, entityType: 'CollectionActorGrant',
        entityId: grant._id, reason, idempotencyKey: key,
        after: { actorId, action, active: true },
      }, session);
      return { grant: present(grant), replay: false };
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return runInTransaction(async session => {
      await activeAdmin(adminId, session);
      await activeWarehouse(warehouseId, session);
      const prior = await replay(session);
      if (prior) return prior;
      throw ApiError.conflict('Collection grant already exists.', 'COLLECTION_GRANT_EXISTS');
    });
  }
}

async function revoke(adminId, warehouseId, grantId, body) {
  warehouseId = requireId(warehouseId, 'INVALID_WAREHOUSE');
  grantId = requireId(grantId, 'INVALID_COLLECTION_GRANT');
  strictBody(body, ['reason', 'idempotencyKey']);
  const reason = requireText(body.reason, 500, 'COLLECTION_GRANT_REASON_REQUIRED');
  const key = requireText(body.idempotencyKey, 100, 'IDEMPOTENCY_KEY_REQUIRED');
  const fingerprint = requestFingerprint('collection-actor-revoke-v1', {
    adminId: String(adminId), warehouseId, grantId, reason,
  });
  return runInTransaction(async session => {
    await activeAdmin(adminId, session);
    await activeWarehouse(warehouseId, session);
    const grant = await CollectionActorGrant.findOne({ _id: grantId, warehouseId })
      .session(session).lean();
    if (!grant) throw ApiError.notFound('Collection grant not found.', 'COLLECTION_GRANT_NOT_FOUND');
    if (grant.revokedAt) {
      if (grant.revocationKey !== key || grant.revocationFingerprint !== fingerprint) {
        throw ApiError.conflict('Collection grant was already revoked.', 'COLLECTION_GRANT_REVOKED');
      }
      return { grant: present(grant), replay: true };
    }
    const updated = await CollectionActorGrant.findOneAndUpdate(
      { _id: grantId, warehouseId, active: true, revokedAt: null },
      { $set: { active: false, revokedAt: new Date(), revokedBy: adminId,
        revocationKey: key, revocationFingerprint: fingerprint, revocationReason: reason } },
      { session, new: true }
    ).lean();
    if (!updated) throw ApiError.conflict('Collection grant state changed.', 'COLLECTION_GRANT_CONFLICT');
    await audit.record({
      action: 'collection.grant_revoked', actorId: adminId, actorRole: 'admin',
      onBehalfOfWarehouseId: warehouseId, entityType: 'CollectionActorGrant',
      entityId: grantId, reason, idempotencyKey: key,
      before: { actorId: grant.actorId, action: grant.action, active: true },
      after: { active: false, revokedAt: updated.revokedAt },
    }, session);
    return { grant: present(updated), replay: false };
  });
}

module.exports = { list, issue, revoke, canGrantToActor };
