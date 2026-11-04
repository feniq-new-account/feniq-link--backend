const { Types } = require('mongoose');
const Warehouse = require('../models/warehouse.model');
const Subscription = require('../models/warehouseSubscription.model');
const Control = require('../models/warehouseFeatureControl.model');
const Bundle = require('../models/featureBundle.model');
const Audit = require('../models/featureControlAudit.model');
const PlatformSetting = require('../models/platformSetting.model');
const { OPTIONAL_FEATURES, SELF_CONFIGURABLE, CORE_FEATURES } = require('../config/featureCatalog');
const { evaluateEntitlements, campaignEligibility } = require('../utils/featureEntitlements');
const { runInTransaction } = require('../utils/transaction');
const { ApiError } = require('../utils/ApiError');
const KEY = 'featureControl';
const invalid = () => ApiError.badRequest('Invalid feature controls.', undefined, 'INVALID_FEATURE_CONTROL');
const changed = () => ApiError.conflict('Feature controls changed. Reload before saving.', 'FEATURE_CONTROL_CHANGED');
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function fields(body, allowed) {
  if (!object(body) || Object.keys(body).some(key => !allowed.includes(key))) throw invalid();
}
function text(value, max) { return typeof value === 'string' && value.trim() && value.length <= max; }
function reason(body) {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !text(body.reason, 1000)) throw invalid();
}
function featureMap(value, allowed) {
  if (!object(value) || Object.entries(value).some(([key, v]) => !allowed.includes(key) || typeof v !== 'boolean')) throw invalid();
  return { ...value };
}
function featureList(value) {
  if (!Array.isArray(value) || !value.length || value.some(key => !OPTIONAL_FEATURES.includes(key)) || new Set(value).size !== value.length) throw invalid();
  return [...value];
}
async function readPlatform(session) {
  return (await PlatformSetting.findOne({ key: KEY }).session(session || null).lean())?.value || { revision: 0, features: {} };
}
async function getEntitlements(warehouseId, { now = new Date(), session, subscription } = {}) {
  // Sequential inside sessions: MongoDB does not support parallel operations
  // on the same transaction. The caller can supply its already-read subscription.
  const row = subscription === undefined ? await Subscription.findOne({ warehouseId }).session(session || null).lean() : subscription;
  const control = await Control.findOne({ warehouseId }).session(session || null).lean();
  const platform = await readPlatform(session);
  const warehouse = await Warehouse.findById(warehouseId).select('createdAt').session(session || null).lean();
  const campaignEligible = campaignEligibility(warehouse, row, now);
  return { ...evaluateEntitlements({ subscription: row, control, platform, now, campaignEligible }), configuration: control || null,
    featureNames: OPTIONAL_FEATURES, coreFeatureNames: CORE_FEATURES };
}
async function audit(session, actorId, scope, warehouseId, action, body, before, after) {
  await Audit.create([{ scope, warehouseId, actorId, action, reason: body.reason.trim(),
    revision: after.revision || 0, before, after }], { session });
}
async function savePlatform(actorId, body) {
  fields(body, ['revision', 'reason', 'features']); reason(body);
  const features = featureMap(body.features, OPTIONAL_FEATURES);
  await PlatformSetting.init();
  try {
    await runInTransaction(async session => {
      const before = await readPlatform(session);
      if (body.revision !== before.revision) throw changed();
      const after = { revision: before.revision + 1, features: { ...before.features, ...features } };
      const row = await PlatformSetting.findOneAndUpdate({ key: KEY, 'value.revision': body.revision },
        { $set: { value: after } }, { new: true, upsert: body.revision === 0, session }).lean();
      if (!row) throw changed();
      await audit(session, actorId, 'platform', null, 'platform.features.updated', body, before, after);
    });
  } catch (error) { if (error.code === 11000) throw changed(); throw error; }
  return readPlatform();
}
async function mutateWarehouse(warehouseId, actorId, body, action, mutate) {
  reason(body); await Control.init();
  try {
    await runInTransaction(async session => {
      if (!await Warehouse.exists({ _id: warehouseId }).session(session)) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
      const before = await Control.findOne({ warehouseId }).session(session).lean();
      if ((before?.revision || 0) !== body.revision) throw changed();
      const next = { configuration: { ...(before?.configuration || {}) },
        grants: (before?.grants || []).map(g => ({ ...g, features: [...g.features] })) };
      await mutate(next, session);
      const after = await Control.findOneAndUpdate({ warehouseId, revision: body.revision },
        { $set: next, $inc: { revision: 1 } }, { new: true, upsert: !before, runValidators: true, session }).lean();
      if (!after) throw changed();
      await audit(session, actorId, 'warehouse', warehouseId, action, body, before, after);
    });
  } catch (error) { if (error.code === 11000) throw changed(); throw error; }
  return getEntitlements(warehouseId);
}
async function configureWarehouse(warehouseId, actorId, body) {
  fields(body, ['revision', 'reason', 'features']);
  const configuration = featureMap(body.features, SELF_CONFIGURABLE);
  return mutateWarehouse(warehouseId, actorId, body, 'warehouse.features.configured', async next => {
    next.configuration = { ...next.configuration, ...configuration };
  });
}
async function createBundle(actorId, body) {
  fields(body, ['code', 'name', 'tier', 'features', 'decisionRef', 'reason']);
  if (!/^[a-z][a-z0-9_-]{0,79}$/.test(body.code || '') || !text(body.name, 120) || !text(body.decisionRef, 500) || !text(body.reason, 1000)) throw invalid();
  if (body.tier !== undefined && !['custom', 'advanced'].includes(body.tier)) throw invalid();
  const selected = featureList(body.features);
  const features = body.tier === 'advanced' ? [...new Set([...selected, 'ownerMobileAccess'])] : selected;
  await Bundle.init();
  try {
    return await runInTransaction(async session => {
      const [bundle] = await Bundle.create([{ code: body.code, name: body.name.trim(), tier: body.tier || 'custom', features,
        decisionRef: body.decisionRef.trim(), createdBy: actorId }], { session });
      await audit(session, actorId, 'bundle', null, 'bundle.created', body, null, bundle.toObject());
      return bundle;
    });
  } catch (error) { if (error.code === 11000) throw ApiError.conflict('Bundle code already exists.', 'BUNDLE_EXISTS'); throw error; }
}
async function addGrant(warehouseId, actorId, body) {
  fields(body, ['revision', 'reason', 'kind', 'sourceCode', 'features', 'startsAt', 'endsAt', 'decisionRef']);
  if (!['bundle', 'addon', 'grant'].includes(body.kind) || !text(body.decisionRef, 500) ||
      typeof body.startsAt !== 'string' || typeof body.endsAt !== 'string') throw invalid();
  const startsAt = new Date(body.startsAt), endsAt = new Date(body.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) throw invalid();
  return mutateWarehouse(warehouseId, actorId, body, 'entitlement.granted', async (next, session) => {
    let features;
    if (body.kind === 'bundle') {
      if (body.features !== undefined || !text(body.sourceCode, 80)) throw invalid();
      const bundle = await Bundle.findOne({ code: body.sourceCode }).session(session).lean();
      if (!bundle) throw ApiError.notFound('Bundle not found.', 'BUNDLE_NOT_FOUND');
      features = bundle.features;
    } else {
      features = featureList(body.features);
      if (body.kind === 'addon' && features.length !== 1) throw invalid();
      if (body.sourceCode !== undefined) throw invalid();
    }
    if (next.grants.length >= 200) throw ApiError.conflict('Grant history limit reached; review required.', 'GRANT_HISTORY_LIMIT');
    if (body.kind === 'addon' && next.grants.some(g => !g.revokedAt && g.features.includes(features[0]) &&
      new Date(g.startsAt) < endsAt && new Date(g.endsAt) > startsAt)) {
      throw ApiError.conflict('The feature is already included for this period.', 'FEATURE_ALREADY_INCLUDED');
    }
    next.grants = [...next.grants, { _id: new Types.ObjectId(), kind: body.kind,
      sourceCode: body.sourceCode || '', features, startsAt, endsAt,
      decisionRef: body.decisionRef.trim(), createdBy: actorId, createdAt: new Date(), revokedAt: null }];
  });
}
async function revokeGrant(warehouseId, grantId, actorId, body) {
  fields(body, ['revision', 'reason']);
  return mutateWarehouse(warehouseId, actorId, body, 'entitlement.revoked', async next => {
    const grant = next.grants.find(g => String(g._id) === String(grantId));
    if (!grant) throw ApiError.notFound('Grant not found.', 'GRANT_NOT_FOUND');
    if (grant.revokedAt) throw ApiError.conflict('Grant already revoked.', 'GRANT_REVOKED');
    grant.revokedAt = new Date();
  });
}
module.exports = { readPlatform, savePlatform, getEntitlements, configureWarehouse, createBundle, addGrant, revokeGrant };
