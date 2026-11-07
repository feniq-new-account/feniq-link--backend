'use strict';

const { Schema, model } = require('mongoose');
const { ACTIONS } = require('../utils/collectionActorPolicy');

// Authorization records only. Creating a grant never posts cash or bypasses
// warehouse/account status checks. Writers must authenticate the grantor,
// audit grant changes, and read active grants from DB inside their workflow.
const collectionActorGrantSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, immutable: true },
  action: { type: String, enum: Object.values(ACTIONS), required: true, immutable: true },
  active: { type: Boolean, default: false }, // fail closed until explicitly approved
  // Incremented only by money-post authorization in the posting transaction.
  // This makes revoke() and a cash post contend on the same MongoDB document.
  authorizationRevision: { type: Number, default: 0 },
  grantedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  grantReason: { type: String, default: null },
  issuanceKey: { type: String },
  issuanceFingerprint: { type: String },
  revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  revocationReason: { type: String, default: null },
  revocationKey: { type: String },
  revocationFingerprint: { type: String },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

// One authoritative record per principal, warehouse and action. Revocation
// deactivates the existing record; do not create competing active grants.
collectionActorGrantSchema.index({ actorId: 1, warehouseId: 1, action: 1 }, { unique: true });
collectionActorGrantSchema.index({ warehouseId: 1, active: 1 });
collectionActorGrantSchema.index({ warehouseId: 1, issuanceKey: 1 },
  { unique: true, partialFilterExpression: { issuanceKey: { $type: 'string' } } });
// A compound sparse index is unsafe: warehouseId is always present, so every
// unrevoked grant would index a null revocationKey and collide with its peers.
collectionActorGrantSchema.index({ warehouseId: 1, revocationKey: 1 },
  { unique: true, partialFilterExpression: { revocationKey: { $type: 'string' } } });

module.exports = model('CollectionActorGrant', collectionActorGrantSchema);
