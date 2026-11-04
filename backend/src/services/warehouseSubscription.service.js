const Warehouse = require('../models/warehouse.model');
const Subscription = require('../models/warehouseSubscription.model');
const Audit = require('../models/warehouseAudit.model');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');

const { FEATURES } = Subscription;
const { PROMOTION_END, evaluateSubscription } = require('../utils/subscriptionPolicy');

async function getSubscription(warehouseId, { now = new Date() } = {}) {
  const row = await Subscription.findOne({ warehouseId }).lean();
  const evaluated = await require('./featureControl.service').getEntitlements(warehouseId, { now, subscription: row });
  return { ...evaluated, configuration: row, controlConfiguration: evaluated.configuration, featureNames: FEATURES };
}

function validatePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw ApiError.badRequest('Invalid subscription.', undefined, 'INVALID_SUBSCRIPTION');
  const patch = {};
  for (const key of Object.keys(body)) {
    if (!['revision', 'plan', 'status', 'paidUntil', 'graceDays', 'features', 'note'].includes(key)) {
      throw ApiError.badRequest('Unknown subscription field.', undefined, 'INVALID_SUBSCRIPTION');
    }
  }
  if (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || body.revision < 0)) {
    throw ApiError.badRequest('Invalid revision.', undefined, 'INVALID_SUBSCRIPTION');
  }
  if (body.plan !== undefined) {
    if (!['free', 'basic', 'management', 'field_team'].includes(body.plan)) throw ApiError.badRequest('Invalid plan.', undefined, 'INVALID_SUBSCRIPTION');
    patch.plan = body.plan;
  }
  if (body.status !== undefined) {
    if (!['free', 'trial', 'active', 'paused'].includes(body.status)) throw ApiError.badRequest('Invalid status.', undefined, 'INVALID_SUBSCRIPTION');
    patch.status = body.status;
  }
  if (body.graceDays !== undefined) {
    if (!Number.isInteger(body.graceDays) || body.graceDays < 0 || body.graceDays > 30) throw ApiError.badRequest('Invalid grace period.', undefined, 'INVALID_SUBSCRIPTION');
    patch.graceDays = body.graceDays;
  }
  if (body.paidUntil !== undefined) {
    const date = body.paidUntil === null ? null : new Date(body.paidUntil);
    if (date !== null && (typeof body.paidUntil !== 'string' || !Number.isFinite(date.getTime()))) throw ApiError.badRequest('Invalid expiry.', undefined, 'INVALID_SUBSCRIPTION');
    patch.paidUntil = date;
  }
  if (body.note !== undefined) {
    if (typeof body.note !== 'string' || body.note.length > 1000) throw ApiError.badRequest('Invalid note.', undefined, 'INVALID_SUBSCRIPTION');
    patch.note = body.note.trim();
  }
  if (body.features !== undefined) {
    if (!body.features || typeof body.features !== 'object' || Array.isArray(body.features)) throw ApiError.badRequest('Invalid features.', undefined, 'INVALID_SUBSCRIPTION');
    for (const [name, value] of Object.entries(body.features)) {
      if (!FEATURES.includes(name) || typeof value !== 'boolean') throw ApiError.badRequest('Invalid feature.', undefined, 'INVALID_SUBSCRIPTION');
      patch[`features.${name}`] = value;
    }
  }
  return patch;
}

async function configureSubscription(warehouseId, actorId, body, now = new Date()) {
  const patch = validatePatch(body);
  await runInTransaction(async (session) => {
    if (!await Warehouse.exists({ _id: warehouseId }).session(session)) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
    const before = await Subscription.findOne({ warehouseId }).session(session).lean();
    if (body.revision !== undefined && body.revision !== (before?.revision || 0)) {
      throw ApiError.conflict('Subscription changed. Reload before saving.', 'FEATURE_CONTROL_CHANGED');
    }
    const effectivePaidUntil = Object.hasOwn(patch, 'paidUntil') ? patch.paidUntil : before?.paidUntil;
    if ((patch.status || before?.status) === 'active' && !effectivePaidUntil) {
      throw ApiError.badRequest('An active subscription needs an expiry date.', undefined, 'INVALID_SUBSCRIPTION');
    }
    const after = await Subscription.findOneAndUpdate({ warehouseId }, {
      $set: patch,
      $inc: { revision: 1 },
      $setOnInsert: { warehouseId, startedAt: now, trialUntil: PROMOTION_END },
    }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
    await Audit.create([{ warehouseId, actorId, action: 'subscription.updated', before, after }], { session });
  });
  return getSubscription(warehouseId, { now });
}

async function hasFeature(warehouseId, name) {
  if (!require('../config/featureCatalog').OPTIONAL_FEATURES.includes(name)) throw new Error(`Unknown feature: ${name}`);
  const result = await getSubscription(warehouseId);
  return result.features[name] === true;
}

async function effectiveLoyaltyTiers(warehouse) {
  const { activeLoyaltyTiers } = require('../utils/loyalty');
  const tiers = warehouse?.loyalty?.mode === 'monthly' ? [] : activeLoyaltyTiers(warehouse);
  if (!tiers.length) return tiers;
  return await hasFeature(warehouse._id, 'loyalty') ? tiers : [];
}

async function effectiveMonthlyLoyalty(warehouse) {
  const { activeLoyaltyTiers } = require('../utils/loyalty');
  if (warehouse?.loyalty?.mode !== 'monthly') return null;
  const tiers = activeLoyaltyTiers(warehouse);
  return tiers.length && await hasFeature(warehouse._id, 'loyalty') ? { tiers } : null;
}

module.exports = { effectiveMonthlyLoyalty, FEATURES, evaluateSubscription, getSubscription, configureSubscription, hasFeature, validatePatch, effectiveLoyaltyTiers };
