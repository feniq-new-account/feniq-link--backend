const mongoose = require('mongoose');
const { runInTransaction } = require('../utils/transaction');
const { requestFingerprint, idempotencyKeyReusedError } = require('../utils/idempotency');
const User = require('../models/user.model');
const { ApiError } = require('../utils/ApiError');
const CommissionCollection = require('../models/commissionCollection.model');
const Warehouse = require('../models/warehouse.model');
const { getSettlementForWarehouse, resolvePeriod } = require('./settlement.service');
const { parseRangeStart, parseRangeEnd } = require('../utils/businessTime');
const { METHODS } = require('./payment.service');
const financialAudit = require('./financialAudit.service');
const { financialReadSnapshot } = require('../utils/financialReadSnapshot');

// The platform's side of commission: who owes what across every warehouse, and
// a record of when one of them actually paid.
//
// What is DERIVED and what is STORED matters here:
//
//   commission owed  -> derived, every time, by settlement.service.js from the
//                       frozen order fields. Never stored, so it can never go
//                       stale or disagree with the orders behind it.
//   collections      -> stored, because "someone handed over money" is a fact
//                       no computation can derive.
//
// Everything below reuses getSettlementForWarehouse rather than restating its
// formula - the clawback rule in particular (a credited return reduces the
// commission on its own order) lives in exactly one place.

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validateAmount(amountSyp) {
  if (typeof amountSyp !== 'number' || !Number.isSafeInteger(amountSyp) || amountSyp <= 0) {
    throw ApiError.badRequest(
      'Invalid collection amount.',
      undefined,
      'INVALID_COLLECTION_AMOUNT'
    );
  }
  // Whole lira, like every other settlement figure.
  return Math.round(amountSyp);
}

const DIRECTIONS = ['from_warehouse', 'to_warehouse'];

function validateDirection(direction) {
  if (direction === undefined || direction === null || direction === '') return 'from_warehouse';
  if (!DIRECTIONS.includes(direction)) {
    throw ApiError.badRequest('Invalid direction.', undefined, 'INVALID_COLLECTION_DIRECTION');
  }
  return direction;
}

function validateMethod(method) {
  if (method === undefined || method === null) return 'cash';
  if (!METHODS.includes(method)) {
    throw ApiError.badRequest('Invalid payment method.', undefined, 'INVALID_PAYMENT_METHOD');
  }
  return method;
}

function invalidPeriod(field) {
  return ApiError.badRequest(`Invalid ${field}.`, undefined, 'INVALID_COLLECTION_PERIOD');
}

// The window a collection covers, read like every report range: a bare date is
// a whole local business day (utils/businessTime.js); a timestamp - what the
// panel sends back from the period it was shown - is kept as it is.
function validatePeriod(periodFrom, periodTo) {
  const from = parseRangeStart(periodFrom);
  if (!from) throw invalidPeriod('period start');
  const to = parseRangeEnd(periodTo);
  if (!to) throw invalidPeriod('period end');
  if (to < from) {
    throw ApiError.badRequest(
      'The period end cannot be before its start.',
      undefined,
      'INVALID_COLLECTION_PERIOD'
    );
  }
  return { from, to };
}

async function loadWarehouseOrThrow(warehouseId, session = null) {
  if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
    throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
  }
  const warehouse = await Warehouse.findById(warehouseId).select('nameAr nameEn phone').session(session).lean();
  if (!warehouse) {
    throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
  }
  return warehouse;
}

// Two date ranges overlap when each starts before the other ends. Written as a
// Mongo filter so the sum is one indexed query rather than a fetch-and-filter.
//
// A collection counts toward a range if its window touches that range AT ALL -
// a warehouse that paid for a whole quarter has settled part of any month
// inside it. Partial-overlap apportioning would need the collection to carry a
// per-day breakdown it does not have, and inventing one would be a guess.
function overlappingPeriod(from, to) {
  return { periodFrom: { $lte: to }, periodTo: { $gte: from } };
}

// The cash that has actually moved for a range, both ways: collected from
// the warehouse, and paid out to it. A row written before payouts existed has
// no `direction` and is a collection.
async function settledForWarehouse(warehouseId, from, to, session = null) {
  const rows = await CommissionCollection.aggregate([
    {
      $match: {
        warehouseId: new mongoose.Types.ObjectId(String(warehouseId)),
        status: 'recorded',
        ...overlappingPeriod(from, to),
      },
    },
    {
      $group: {
        _id: { $ifNull: ['$direction', 'from_warehouse'] },
        total: { $sum: '$amountSyp' },
      },
    },
  ]).session(session);
  const byDirection = new Map(rows.map((row) => [row._id, row.total]));
  return {
    collectedSyp: Math.round(byDirection.get('from_warehouse') ?? 0),
    paidOutSyp: Math.round(byDirection.get('to_warehouse') ?? 0),
  };
}

async function collectedForWarehouse(warehouseId, from, to) {
  const { collectedSyp } = await settledForWarehouse(warehouseId, from, to);
  return collectedSyp;
}

// One warehouse's position with the platform for a range: the commission it
// owes, the discount-code compensation the platform owes it, the cash that has
// moved each way, and what is left.
async function getWarehouseCommission(warehouse, period, session = null) {
  return session ? readWarehouseCommission(warehouse, period, session)
    : financialReadSnapshot(snapshot => readWarehouseCommission(warehouse, period, snapshot));
}
async function readWarehouseCommission(warehouse, period, session) {
  const settlement = await getSettlementForWarehouse(warehouse._id, {
    from: period.from,
    to: period.to,
  }, session);
  const { collectedSyp, paidOutSyp } = await settledForWarehouse(warehouse._id, period.from, period.to, session);

  // `netCommissionSyp` is already net of the pro-rata clawback on credited
  // returns - that is what the warehouse genuinely owes before anything is
  // collected. Renamed here to the vocabulary the admin screen speaks.
  const commissionOwedSyp = settlement.totals.netCommissionSyp;
  const held = await require('../models/feniqRemittance.model').Withholding.aggregate([
    { $match: { warehouseId: warehouse._id, at: { $gte: period.from, $lte: period.to } } },
    { $group: { _id: null, amount: { $sum: '$amountSyp' } } },
  ]).session(session);
  const heldByFeniqSyp = held[0]?.amount || 0;
  const lastCustody = await require('../models/feniqRemittance.model').Reconciliation.findOne({ warehouseId: warehouse._id }).sort({ _id: -1 }).session(session).lean();
  const custodyUnreconciled = lastCustody?.result?.ready === false;

  // What the platform owes the warehouse for admin discount codes, net of
  // returns - the other side of the same relationship.
  const compensationOwedSyp = settlement.totals.netCompensationSyp ?? 0;
  const periodOutstandingSyp = commissionOwedSyp - compensationOwedSyp - collectedSyp + paidOutSyp - heldByFeniqSyp;
  const hasCustody = Boolean(await require('../models/feniqCashCustody.model').exists({ warehouseId: warehouse._id }).session(session));
  let currentCashOutstandingSyp = null;
  let postable = periodOutstandingSyp;
  if (hasCustody && !custodyUnreconciled) {
    const allTime = { from: new Date(0), to: new Date('9999-12-31T23:59:59.999Z') };
    const all = await getSettlementForWarehouse(warehouse._id, allTime, session);
    const allCash = await settledForWarehouse(warehouse._id, allTime.from, allTime.to, session);
    const allHeld = await require('../models/feniqRemittance.model').Withholding.aggregate([
      { $match: { warehouseId: warehouse._id } }, { $group: { _id: null, amount: { $sum: '$amountSyp' } } },
    ]).session(session);
    currentCashOutstandingSyp = all.totals.netCommissionSyp - (all.totals.netCompensationSyp || 0)
      - allCash.collectedSyp + allCash.paidOutSyp - (allHeld[0]?.amount || 0);
    // Period accrual movements are not a second claim on physically held cash.
    // Bound BOTH directions by the verified current all-time cash obligation.
    postable = periodOutstandingSyp > 0 && currentCashOutstandingSyp > 0 ? Math.min(periodOutstandingSyp, currentCashOutstandingSyp)
      : periodOutstandingSyp < 0 && currentCashOutstandingSyp < 0 ? Math.max(periodOutstandingSyp, currentCashOutstandingSyp) : 0;
  }


  return {
    warehouseId: warehouse._id,
    warehouse,
    ...(settlement.collectionCommission ? { asOf: settlement.asOf, collectionCommission: settlement.collectionCommission } : {}),
    orderCount: settlement.totals.orderCount,
    salesSyp: settlement.totals.grossSalesSyp,
    returnsSyp: settlement.totals.creditedSalesSyp,
    commissionOwedSyp,
    heldByFeniqSyp, custodyUnreconciled,
    periodOutstandingSyp, currentCashOutstandingSyp, cashDueScope: hasCustody ? 'selected_period_bounded_by_current_cash' : 'selected_period',
    compensationOwedSyp,
    alreadyCollectedSyp: collectedSyp,
    paidOutSyp,
    // Positive: the warehouse owes the platform. Negative: the platform owes
    // the warehouse (its compensation exceeds its commission, or it over-paid,
    // or it paid for a wider window than the one being viewed). Reported
    // as-is rather than clamped: a negative here is information, and hiding
    // it would make a debt the platform owes look like a settled account.
    outstandingSyp: custodyUnreconciled ? null : postable,
  };
}

// The cross-warehouse overview: the same per-warehouse settlement computation
// Step 6 built, run across every warehouse for one admin-chosen range, plus
// the collection layer.
//
// Every warehouse is listed, including those that sold nothing in the range -
// an admin scanning for who owes what needs the zeroes to be visibly zero
// rather than absent and ambiguous.
async function getCommissionOverview({ from, to } = {}) {
  const period = resolvePeriod({ from, to });
  const warehouses = await Warehouse.find({}).select('nameAr nameEn phone isActive').lean();

  const rows = await Promise.all(
    warehouses.map((warehouse) => getWarehouseCommission(warehouse, period))
  );

  // Most-owing first, which is the order an admin actually works through.
  rows.sort((a, b) => b.outstandingSyp - a.outstandingSyp);

  const totals = rows.reduce(
    (acc, row) => ({
      salesSyp: acc.salesSyp + row.salesSyp,
      returnsSyp: acc.returnsSyp + row.returnsSyp,
      commissionOwedSyp: acc.commissionOwedSyp + row.commissionOwedSyp,
      compensationOwedSyp: acc.compensationOwedSyp + row.compensationOwedSyp,
      alreadyCollectedSyp: acc.alreadyCollectedSyp + row.alreadyCollectedSyp,
      paidOutSyp: acc.paidOutSyp + row.paidOutSyp,
      periodOutstandingSyp: acc.periodOutstandingSyp + row.periodOutstandingSyp,
      outstandingSyp: acc.outstandingSyp == null || row.outstandingSyp == null ? null : acc.outstandingSyp + row.outstandingSyp,
    }),
    {
      salesSyp: 0,
      returnsSyp: 0,
      commissionOwedSyp: 0,
      compensationOwedSyp: 0,
      alreadyCollectedSyp: 0,
      paidOutSyp: 0,
      periodOutstandingSyp: 0,
      outstandingSyp: 0,
    }
  );

  return { period, totals, rows };
}

// One warehouse's detail: the same figures as its overview row, plus the
// per-order settlement breakdown and its collection history.
async function getWarehouseCommissionDetail(warehouseId, { from, to, limit, after } = {}) {
  return financialReadSnapshot(async session => {
  const warehouse = await loadWarehouseOrThrow(warehouseId, session);
  const period = resolvePeriod({ from, to });

  const summary = await getWarehouseCommission(warehouse, period, session);
  const settlement = await getSettlementForWarehouse(warehouse._id, { from: period.from, to: period.to }, session);
    // The full history, not just the range: a reversed collection from outside
    // the window still explains why an outstanding figure moved. Now cursor-
    // paginated rather than a flat limit:100 - see listCollectionsForWarehouse.
  const collectionsPage = await listCollectionsForWarehouse(warehouse._id, { limit, after }, session);

  return {
    period,
    warehouse,
    summary,
    orders: settlement.rows,
    collections: collectionsPage.rows,
    hasMoreCollections: collectionsPage.hasMore,
    nextCollectionsCursor: collectionsPage.nextCursor,
    ...(settlement.collectionCommission ? { asOf: settlement.asOf, collectionCommission: settlement.collectionCommission } : {}),
  };
  });
}

// Cursor-paginated on `_id` rather than `recordedAt` - the two orderings
// always agree (recordedAt is stamped with `new Date()` at the exact instant
// recordCollection creates the row, and is never backdated), and `_id` is
// what every other cursor-paginated list in the app sorts and cursors on
// (see offer.service.js's listPaginatedOffers).
async function listCollectionsForWarehouse(warehouseId, { limit = 100, after = null } = {}, session = null) {
  const filter = after !== null ? { warehouseId, _id: { $lt: after } } : { warehouseId };
  const rows = await CommissionCollection.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .session(session)
    .lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = page.length > 0 ? String(page[page.length - 1]._id) : null;
  return { rows: page, hasMore, nextCursor };
}

// Records that a warehouse paid its commission - or, with direction
// 'to_warehouse', that the platform paid the warehouse the discount-code
// compensation it owed it (a payout).
//
// Financial cash and audit are committed together. Internal callers and HTTP
// clients use the same mandatory request-key contract.
const canonicalId = value => mongoose.isObjectIdOrHexString(value) ? new mongoose.Types.ObjectId(value).toHexString() : String(value);
function operationKey(value) {
  if (value === undefined || value === null || value === '') throw ApiError.badRequest('An idempotency key is required.', undefined, 'IDEMPOTENCY_KEY_REQUIRED');
  if (typeof value !== 'string' || !value.trim() || value.length > 100) {
    throw ApiError.badRequest('Invalid idempotency key.', undefined, 'INVALID_IDEMPOTENCY_KEY');
  }
  return value.trim();
}
async function requireAdmin(actorId, session) {
  const actor = mongoose.isObjectIdOrHexString(actorId)
    ? await User.findById(actorId).select('role status').session(session).lean() : null;
  if (actor?.role !== 'admin' || actor.status !== 'active') throw ApiError.forbidden('Active platform administration is required.');
}
function replay(collection, fingerprint, field) {
  if (collection[field] !== fingerprint) throw idempotencyKeyReusedError('The key identifies a different commission cash request.');
  collection.$locals.idempotentReplay = true;
  return collection;
}
async function recordCollection({ warehouseId, periodFrom, periodTo, amountSyp, method, reference, note, actorId, direction, idempotencyKey }) {
  const amount = validateAmount(amountSyp), period = validatePeriod(periodFrom, periodTo);
  const resolvedMethod = validateMethod(method), resolvedDirection = validateDirection(direction);
  const key = operationKey(idempotencyKey);
  const fingerprint = requestFingerprint('commission-cash-v1', { warehouseId: canonicalId(warehouseId), actorId: canonicalId(actorId),
    from: period.from.toISOString(), to: period.to.toISOString(), amount, method: resolvedMethod, direction: resolvedDirection,
    reference: normalizeText(reference), note: normalizeText(note) });
  await CommissionCollection.createIndexes();
  const work = async session => {
    await requireAdmin(actorId, session);
    const warehouse = await loadWarehouseOrThrow(warehouseId, session);
    if (key) {
      const existing = await CommissionCollection.findOne({ warehouseId: warehouse._id, idempotencyKey: key }).session(session);
      if (existing) return replay(existing, fingerprint, 'requestFingerprint');
    }
    if (await require('../models/feniqCashCustody.model').exists({ warehouseId: warehouse._id }).session(session)) {
      await require('./feniqRemittance.service').lock(String(warehouse._id), session);
      const cash = await readWarehouseCommission(warehouse, period, session);
      if (cash.custodyUnreconciled || (resolvedDirection === 'from_warehouse' ? amount > cash.outstandingSyp : amount > -cash.outstandingSyp)) {
        throw ApiError.conflict('Feniq-held commission must not be collected again; reconcile the separate cash sources.', 'FENIQ_COMMISSION_ALREADY_HELD');
      }
    }
    const [collection] = await CommissionCollection.create([{ warehouseId: warehouse._id, periodFrom: period.from, periodTo: period.to,
      amountSyp: amount, direction: resolvedDirection, method: resolvedMethod, reference: normalizeText(reference), note: normalizeText(note),
      recordedBy: actorId, recordedAt: new Date(), status: 'recorded', idempotencyKey: key, requestFingerprint: fingerprint,
    }], { session });
    await financialAudit.record({ action: resolvedDirection === 'to_warehouse' ? 'commission.payout_recorded' : 'commission.collected',
      actorId, actorRole: 'admin', onBehalfOfWarehouseId: warehouse._id, entityType: 'CommissionCollection', entityId: collection._id,
      idempotencyKey: key, after: { amountSyp: amount, direction: resolvedDirection, method: resolvedMethod, periodFrom: period.from, periodTo: period.to },
    }, session);
    return collection;
  };
  try { return await runInTransaction(work); }
  catch (error) { if (error?.code === 11000 && key) return runInTransaction(work); throw error; }
}

async function reverseCollection({ collectionId, reason, actorId, idempotencyKey }) {
  const trimmedReason = normalizeText(reason);
  if (!trimmedReason) throw ApiError.badRequest('A reason is required to reverse a collection.', undefined, 'REASON_REQUIRED');
  if (!mongoose.isObjectIdOrHexString(collectionId)) throw ApiError.notFound('Collection not found.', 'COLLECTION_NOT_FOUND');
  const key = operationKey(idempotencyKey);
  const fingerprint = requestFingerprint('commission-cash-reversal-v1', { collectionId: canonicalId(collectionId), actorId: canonicalId(actorId), reason: trimmedReason });
  const work = async session => {
    await requireAdmin(actorId, session);
    if (key) {
      const prior = await CommissionCollection.findOne({ reversalKey: key }).session(session);
      if (prior) return replay(prior, fingerprint, 'reversalFingerprint');
    }
    const existing = await CommissionCollection.findById(collectionId).session(session);
    if (!existing) throw ApiError.notFound('Collection not found.', 'COLLECTION_NOT_FOUND');
    const reversed = await CommissionCollection.findOneAndUpdate({ _id: existing._id, status: 'recorded' }, { $set: {
      status: 'reversed', reversedBy: actorId, reversedAt: new Date(), reversalReason: trimmedReason,
      reversalKey: key, reversalFingerprint: fingerprint,
    } }, { new: true, session });
    if (!reversed) throw ApiError.conflict('This collection has already been reversed.', 'COLLECTION_ALREADY_REVERSED');
    await financialAudit.record({ action: 'commission.collection_reversed', actorId, actorRole: 'admin',
      onBehalfOfWarehouseId: reversed.warehouseId, entityType: 'CommissionCollection', entityId: reversed._id,
      before: { status: 'recorded', amountSyp: reversed.amountSyp }, after: { status: 'reversed' }, reason: trimmedReason, idempotencyKey: key,
    }, session);
    return reversed;
  };
  try { return await runInTransaction(work); }
  catch (error) { if (error?.code === 11000 && key) return runInTransaction(work); throw error; }
}

module.exports = {
  getCommissionOverview,
  getWarehouseCommissionDetail,
  listCollectionsForWarehouse,
  recordCollection,
  reverseCollection,
  collectedForWarehouse,
  settledForWarehouse,
};
