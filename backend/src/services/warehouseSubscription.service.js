const Warehouse = require('../models/warehouse.model');
const Subscription = require('../models/warehouseSubscription.model');
const Audit = require('../models/warehouseAudit.model');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');

const DAY_MS = 86400000;
const { FEATURES } = Subscription;

function evaluateSubscription(row, now = new Date()) {
  // Existing warehouses are not unexpectedly locked by a schema rollout.
  // Their trial begins at their first explicit subscription activation/read.
  if (!row) return { state: 'not_started', features: Object.fromEntries(FEATURES.map((key) => [key, true])) };
  const until = row.status === 'trial' ? row.trialUntil : row.paidUntil;
  const expires = until ? new Date(until).getTime() : NaN;
  const graceUntil = Number.isFinite(expires) ? new Date(expires + row.graceDays * DAY_MS) : null;
  const state = row.status === 'paused' ? 'paused'
    : now.getTime() < expires ? row.status
    : graceUntil && now < graceUntil ? 'grace' : 'expired';
  const usable = ['trial', 'active', 'grace'].includes(state);
  return {
    state, expiresAt: until || null, graceUntil,
    features: Object.fromEntries(FEATURES.map((key) => [key, usable && row.features?.[key] !== false])),
  };
}

async function getSubscription(warehouseId, { startTrial = false, now = new Date() } = {}) {
  let row = await Subscription.findOne({ warehouseId }).lean();
  if (!row && startTrial) {
    try {
      row = await Subscription.findOneAndUpdate({ warehouseId }, { $setOnInsert: {
        warehouseId, startedAt: now, trialUntil: new Date(now.getTime() + 30 * DAY_MS),
      } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      row = await Subscription.findOne({ warehouseId }).lean();
    }
  }
  return { configuration: row, ...evaluateSubscription(row, now), featureNames: FEATURES };
}

function validatePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw ApiError.badRequest('Invalid subscription.', undefined, 'INVALID_SUBSCRIPTION');
  const patch = {};
  for (const key of Object.keys(body)) {
    if (!['plan', 'status', 'paidUntil', 'graceDays', 'features', 'note'].includes(key)) {
      throw ApiError.badRequest('Unknown subscription field.', undefined, 'INVALID_SUBSCRIPTION');
    }
  }
  if (body.plan !== undefined) {
    if (!['basic', 'management', 'field_team'].includes(body.plan)) throw ApiError.badRequest('Invalid plan.', undefined, 'INVALID_SUBSCRIPTION');
    patch.plan = body.plan;
  }
  if (body.status !== undefined) {
    if (!['trial', 'active', 'paused'].includes(body.status)) throw ApiError.badRequest('Invalid status.', undefined, 'INVALID_SUBSCRIPTION');
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
    const effectivePaidUntil = Object.hasOwn(patch, 'paidUntil') ? patch.paidUntil : before?.paidUntil;
    if ((patch.status || before?.status) === 'active' && !effectivePaidUntil) {
      throw ApiError.badRequest('An active subscription needs an expiry date.', undefined, 'INVALID_SUBSCRIPTION');
    }
    const after = await Subscription.findOneAndUpdate({ warehouseId }, {
      $set: patch,
      $setOnInsert: { warehouseId, startedAt: now, trialUntil: new Date(now.getTime() + 30 * DAY_MS) },
    }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
    await Audit.create([{ warehouseId, actorId, action: 'subscription.updated', before, after }], { session });
  });
  return getSubscription(warehouseId, { now });
}

async function hasFeature(warehouseId, name) {
  if (!FEATURES.includes(name)) throw new Error(`Unknown feature: ${name}`);
  const result = await getSubscription(warehouseId);
  return result.features[name] === true;
}

async function effectiveLoyaltyTiers(warehouse) {
  const { activeLoyaltyTiers } = require('../utils/loyalty');
  const tiers = activeLoyaltyTiers(warehouse);
  if (!tiers.length) return tiers;
  return await hasFeature(warehouse._id, 'loyalty') ? tiers : [];
}

module.exports = { FEATURES, evaluateSubscription, getSubscription, configureSubscription, hasFeature, validatePatch, effectiveLoyaltyTiers };
