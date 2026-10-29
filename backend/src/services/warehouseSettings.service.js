const { runInTransaction } = require('../utils/transaction');
const WarehouseAudit = require('../models/warehouseAudit.model');
const { ApiError } = require('../utils/ApiError');
const Warehouse = require('../models/warehouse.model');
const { assertRateUsedIsCurrent } = require('./exchangeRate.service');
const { parseLoyaltyTiers, MAX_LOYALTY_TIERS } = require('../utils/loyalty');

// Section: the warehouse's own settings it is allowed to change itself -
// currently the order-size limits (warehouse.model.js's minOrderAmountUsd/
// maxOrderAmountUsd) plus the requireDeliverySealPhoto toggle. Deliberately a
// narrow update - only these fields are writable here, so this endpoint can
// never be used to edit the name/rates/anything else the admin owns.

// `undefined` means "not sent", which leaves the stored value untouched.
// An explicit null/'' clears the maximum ("no maximum"); the minimum has no
// null state - 0 is its "no minimum".
function parseAmount(value, field, code, { nullable }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    if (nullable) return null;
    throw ApiError.badRequest(`${field} is required.`, undefined, code);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw ApiError.badRequest(`${field} must be a number of 0 or more.`, undefined, code);
  }
  // Money: two decimals, same rounding the rest of the USD figures use.
  return Math.round(amount * 100) / 100;
}

async function getSettings(warehouseId) {
  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse) {
    throw ApiError.notFound('Warehouse profile not found.', 'WAREHOUSE_PROFILE_NOT_FOUND');
  }
  return warehouse;
}

// A limit the panel sets to a new amount was converted from SYP, so it comes
// with `rateUsed`, which must still be the current rate. Clearing a limit (0 /
// null) or re-sending the stored value converts nothing and needs no rate -
// so the seal-photo toggle on its own never trips this.
async function updateOrderLimits(
  warehouseId,
  { minOrderAmountUsd, maxOrderAmountUsd, requireDeliverySealPhoto, rateUsed },
  { requireRateUsed = false } = {}
) {
  const warehouse = await getSettings(warehouseId);

  const nextMin = parseAmount(minOrderAmountUsd, 'Minimum order amount', 'INVALID_MIN_ORDER_AMOUNT', {
    nullable: false,
  });
  const nextMax = parseAmount(maxOrderAmountUsd, 'Maximum order amount', 'INVALID_MAX_ORDER_AMOUNT', {
    nullable: true,
  });

  // Validated against the values that will actually be stored (the incoming
  // one where sent, the existing one otherwise) - not just against each
  // other, so sending only one of the two can't create an inverted pair.
  const effectiveMin = nextMin === undefined ? warehouse.minOrderAmountUsd : nextMin;
  const effectiveMax = nextMax === undefined ? warehouse.maxOrderAmountUsd : nextMax;
  if (effectiveMin > 0 && effectiveMax !== null && effectiveMin >= effectiveMax) {
    throw ApiError.badRequest(
      'The minimum order amount must be lower than the maximum.',
      undefined,
      'INVALID_ORDER_LIMITS'
    );
  }

  const minConverted = nextMin !== undefined && nextMin > 0 && nextMin !== warehouse.minOrderAmountUsd;
  const maxConverted =
    nextMax !== undefined && nextMax !== null && nextMax !== (warehouse.maxOrderAmountUsd ?? null);
  if (minConverted || maxConverted) {
    await assertRateUsedIsCurrent(rateUsed, { required: requireRateUsed });
  }

  if (nextMin !== undefined) warehouse.minOrderAmountUsd = nextMin;
  if (nextMax !== undefined) warehouse.maxOrderAmountUsd = nextMax;

  // `undefined` = not sent, leave as-is; anything else is coerced to a plain
  // boolean so the client can never store a non-boolean into this flag.
  if (requireDeliverySealPhoto !== undefined) {
    warehouse.requireDeliverySealPhoto = Boolean(requireDeliverySealPhoto);
  }

  await warehouse.save();

  return warehouse;
}

// The warehouse's loyalty discount: on/off, and its tiers ("an order of at
// least minSyp gets discountSyp off" - whole liras). The warehouse pays for it,
// so it is the warehouse's to set. Applies to orders placed from now on: each
// order keeps the tiers it was placed under (order.model.js's loyaltyTiers).
async function updateLoyalty(warehouseId, { enabled, tiers, mode, revision, actorId }) {
  const warehouse = await getSettings(warehouseId);
  const expectedRevision = revision ?? warehouse.loyalty?.revision ?? 0;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw ApiError.badRequest('Invalid loyalty revision.', undefined, 'INVALID_LOYALTY');
  }
  if (expectedRevision !== (warehouse.loyalty?.revision ?? 0)) {
    throw ApiError.conflict('Loyalty configuration changed; reload settings.', 'LOYALTY_CHANGED');
  }
  const before = { enabled: warehouse.loyalty?.enabled ?? false, mode: warehouse.loyalty?.mode ?? 'per_order',
    revision: expectedRevision, tiers: (warehouse.loyalty?.tiers || []).map((tier) => ({ minSyp: tier.minSyp, discountSyp: tier.discountSyp })) };
  if (mode !== undefined) {
    if (!['per_order', 'monthly'].includes(mode)) throw ApiError.badRequest('Invalid loyalty mode.', undefined, 'INVALID_LOYALTY');
    warehouse.loyalty = warehouse.loyalty ?? {};
    warehouse.loyalty.mode = mode;
  }
  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') {
      throw ApiError.badRequest('enabled must be true or false.', undefined, 'INVALID_LOYALTY');
    }
    warehouse.loyalty = warehouse.loyalty ?? {};
    warehouse.loyalty.enabled = enabled;
  }
  if (tiers !== undefined) {
    const parsed = parseLoyaltyTiers(tiers);
    if (!parsed) {
      throw ApiError.badRequest(
        `Each tier needs a minimum above 0 and a discount below it, in whole liras, at most ${MAX_LOYALTY_TIERS} tiers, no two on the same minimum.`,
        undefined,
        'INVALID_LOYALTY_TIERS'
      );
    }
    warehouse.loyalty = warehouse.loyalty ?? {};
    warehouse.loyalty.tiers = parsed;
  }
  if (warehouse.loyalty?.mode === 'monthly') {
    const rows = warehouse.loyalty.tiers || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].discountSyp < rows[i - 1].discountSyp) {
        throw ApiError.badRequest('Monthly rewards must not decrease at higher thresholds.', undefined, 'INVALID_LOYALTY_TIERS');
      }
    }
  }
  if (warehouse.loyalty?.enabled && !(warehouse.loyalty.tiers?.length > 0)) {
    throw ApiError.badRequest('Add at least one tier before switching loyalty on.', undefined, 'LOYALTY_TIERS_REQUIRED');
  }
  const after = { enabled: warehouse.loyalty?.enabled ?? false, mode: warehouse.loyalty?.mode ?? 'per_order',
    revision: expectedRevision + 1, tiers: (warehouse.loyalty?.tiers || []).map((tier) => ({ minSyp: tier.minSyp, discountSyp: tier.discountSyp })) };
  return runInTransaction(async (session) => {
    const updated = await Warehouse.findOneAndUpdate({ _id: warehouseId,
      ...(expectedRevision ? { 'loyalty.revision': expectedRevision } : { $or: [
        { 'loyalty.revision': 0 }, { 'loyalty.revision': { $exists: false } },
      ] }),
    }, { $set: { loyalty: after } }, { session, new: true });
    if (!updated) throw ApiError.conflict('Loyalty configuration changed; reload settings.', 'LOYALTY_CHANGED');
    if (actorId) await WarehouseAudit.create([{ warehouseId, actorId, action: 'loyalty.configured', before, after }], { session });
    return updated;
  });
}

module.exports = { getSettings, updateOrderLimits, updateLoyalty };
