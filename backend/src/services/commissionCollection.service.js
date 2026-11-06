const mongoose = require('mongoose');
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
  if (typeof amountSyp !== 'number' || !Number.isFinite(amountSyp) || amountSyp <= 0) {
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
  // What the platform owes the warehouse for admin discount codes, net of
  // returns - the other side of the same relationship.
  const compensationOwedSyp = settlement.totals.netCompensationSyp ?? 0;

  return {
    warehouseId: warehouse._id,
    warehouse,
    ...(settlement.collectionCommission ? { asOf: settlement.asOf, collectionCommission: settlement.collectionCommission } : {}),
    orderCount: settlement.totals.orderCount,
    salesSyp: settlement.totals.grossSalesSyp,
    returnsSyp: settlement.totals.creditedSalesSyp,
    commissionOwedSyp,
    compensationOwedSyp,
    alreadyCollectedSyp: collectedSyp,
    paidOutSyp,
    // Positive: the warehouse owes the platform. Negative: the platform owes
    // the warehouse (its compensation exceeds its commission, or it over-paid,
    // or it paid for a wider window than the one being viewed). Reported
    // as-is rather than clamped: a negative here is information, and hiding
    // it would make a debt the platform owes look like a settled account.
    outstandingSyp: commissionOwedSyp - compensationOwedSyp - collectedSyp + paidOutSyp,
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
      outstandingSyp: acc.outstandingSyp + row.outstandingSyp,
    }),
    {
      salesSyp: 0,
      returnsSyp: 0,
      commissionOwedSyp: 0,
      compensationOwedSyp: 0,
      alreadyCollectedSyp: 0,
      paidOutSyp: 0,
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
// No transaction, no CAS, no idempotency key - deliberately. Those exist on
// the pharmacy paths because those are high-frequency, racy, and move a
// pharmacy's balance. This is an admin typing one bookkeeping row: a duplicate
// is visible in the history and reversible, which is proportionate. It is
// still audited, because every financial mutation is.
async function recordCollection({
  warehouseId,
  periodFrom,
  periodTo,
  amountSyp,
  method,
  reference,
  note,
  actorId,
  direction,
}) {
  const warehouse = await loadWarehouseOrThrow(warehouseId);
  const amount = validateAmount(amountSyp);
  const period = validatePeriod(periodFrom, periodTo);
  const resolvedMethod = validateMethod(method);
  const resolvedDirection = validateDirection(direction);

  const collection = await CommissionCollection.create({
    warehouseId: warehouse._id,
    periodFrom: period.from,
    periodTo: period.to,
    amountSyp: amount,
    direction: resolvedDirection,
    method: resolvedMethod,
    reference: normalizeText(reference),
    note: normalizeText(note),
    recordedBy: actorId,
    recordedAt: new Date(),
    status: 'recorded',
  });

  await financialAudit.record({
    action: resolvedDirection === 'to_warehouse' ? 'commission.payout_recorded' : 'commission.collected',
    actorId,
    actorRole: 'admin',
    onBehalfOfWarehouseId: warehouse._id,
    entityType: 'CommissionCollection',
    entityId: collection._id,
    after: {
      amountSyp: amount,
      direction: resolvedDirection,
      method: resolvedMethod,
      periodFrom: period.from,
      periodTo: period.to,
    },
  });

  return collection;
}

// Undoes a collection recorded in error. The row is kept and stays visible in
// the history, struck through with its reason - the same treatment a reversed
// pharmacy payment gets. Once reversed it no longer counts toward
// alreadyCollectedSyp, so the warehouse's outstanding amount goes back up.
async function reverseCollection({ collectionId, reason, actorId }) {
  const trimmedReason = normalizeText(reason);
  if (!trimmedReason) {
    throw ApiError.badRequest(
      'A reason is required to reverse a collection.',
      undefined,
      'REASON_REQUIRED'
    );
  }
  if (!mongoose.Types.ObjectId.isValid(collectionId)) {
    throw ApiError.notFound('Collection not found.', 'COLLECTION_NOT_FOUND');
  }

  const existing = await CommissionCollection.findById(collectionId);
  if (!existing) {
    throw ApiError.notFound('Collection not found.', 'COLLECTION_NOT_FOUND');
  }

  // Guarded as a conditional update rather than a read-then-save, so a second
  // reversal matches zero documents instead of overwriting the first one's
  // reason and actor.
  const reversed = await CommissionCollection.findOneAndUpdate(
    { _id: existing._id, status: 'recorded' },
    {
      $set: {
        status: 'reversed',
        reversedBy: actorId,
        reversedAt: new Date(),
        reversalReason: trimmedReason,
      },
    },
    { new: true }
  );
  if (!reversed) {
    throw ApiError.conflict(
      'This collection has already been reversed.',
      'COLLECTION_ALREADY_REVERSED'
    );
  }

  await financialAudit.record({
    action: 'commission.collection_reversed',
    actorId,
    actorRole: 'admin',
    onBehalfOfWarehouseId: reversed.warehouseId,
    entityType: 'CommissionCollection',
    entityId: reversed._id,
    before: { status: 'recorded', amountSyp: reversed.amountSyp },
    after: { status: 'reversed' },
    reason: trimmedReason,
  });

  return reversed;
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
