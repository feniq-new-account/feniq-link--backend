const mongoose = require('mongoose');
const Warehouse = require('../models/warehouse.model');
const LedgerEntry = require('../models/ledgerEntry.model');
const Order = require('../models/order.model');
const RepAssignment = require('../models/repAssignment.model');
const Pharmacy = require('../models/pharmacy.model');
const Return = require('../models/return.model');
const { runInTransaction } = require('../utils/transaction');
const { ageAccount, dayNumber } = require('../utils/receivableAging');
const { businessDateOf, BUSINESS_TIME_ZONE } = require('../utils/businessTime');
const { resolveSummaryPeriod } = require('./warehouseSummary.service');
const { ApiError } = require('../utils/ApiError');
const cache = new Map();
const TTL = 15000;
const DAYS = 86400000;
const DEFAULT_FOLLOW_UP = { overdueDays: 15, inactiveDays: 15, revision: 0 };
function configuration(warehouse) { return { ...DEFAULT_FOLLOW_UP, ...(warehouse?.followUp?.toObject?.() || warehouse?.followUp || {}) }; }
function invalidate(warehouseId) { cache.delete(String(warehouseId)); }

async function loadSnapshot(warehouseId, now) {
  const id = new mongoose.Types.ObjectId(warehouseId);
  return runInTransaction(async (session) => {
    const warehouse = await Warehouse.findById(id).select('followUp').session(session).lean();
    if (!warehouse) throw ApiError.notFound('Warehouse not found.');
    const settings = configuration(warehouse);
    const movements = new Map();
    const agedAccounts = new Map();
    let accountId = null, pharmacyId = null, accountEntries = [];
    const flushAccount = () => {
      if (pharmacyId !== null) agedAccounts.set(pharmacyId, ageAccount(accountEntries, { overdueDays: settings.overdueDays, now }));
      accountEntries = [];
    };
    const pharmacyIds = new Set();
    for await (const row of LedgerEntry.find({ warehouseId: id, createdAt: { $lte: now } })
      .select('accountId pharmacyId kind direction amountSyp effectiveAt sequence source.orderId metadata.orderId reversalOf')
      .sort({ accountId: 1, effectiveAt: 1, sequence: 1 }).session(session).lean().cursor()) {
      if (accountId !== String(row.accountId)) {
        flushAccount(); accountId = String(row.accountId); pharmacyId = String(row.pharmacyId);
      }
      pharmacyIds.add(pharmacyId);
      accountEntries.push(row);
      const rule = MOVEMENTS[row.kind];
      if (rule && row.effectiveAt <= now) {
        const date = businessDateOf(row.effectiveAt);
        const day = movements.get(date) || { date, salesSyp: 0, returnsSyp: 0, collectionsSyp: 0 };
        day[rule[0]] += rule[1] * row.amountSyp; movements.set(date, day);
      }
    }
    flushAccount();
    const lastOrders = await Order.aggregate([
      { $match: { warehouseId: id, status: { $ne: 'cancelled' }, createdAt: { $lte: now } } },
      { $group: { _id: '$pharmacyId', lastOrderAt: { $max: '$createdAt' } } },
    ]).session(session);
    const assignments = await RepAssignment.find({ warehouseId: id, active: true, createdAt: { $lte: now } })
      .select('pharmacyId createdAt').session(session).lean();
    const activity = new Map(lastOrders.map((row) => [String(row._id), { lastOrderAt: row.lastOrderAt }]));
    for (const row of lastOrders) pharmacyIds.add(String(row._id));
    for (const row of assignments) {
      const key = String(row.pharmacyId); pharmacyIds.add(key);
      const current = activity.get(key) || {};
      if (!current.assignedAt || row.createdAt < current.assignedAt) current.assignedAt = row.createdAt;
      activity.set(key, current);
    }
    const staleQueueBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const pendingOrders = await Order.countDocuments({ warehouseId: id, status: { $in: ['pending', 'preparing'] }, createdAt: { $lte: staleQueueBefore } }).session(session);
    const pendingReturns = await Return.countDocuments({ warehouseId: id, status: 'pending', createdAt: { $lte: staleQueueBefore } }).session(session);
    const names = await Pharmacy.find({ _id: { $in: [...pharmacyIds] } }).select('nameAr nameEn phone city address')
      .session(session).lean();
    const named = new Map(names.map((row) => [String(row._id), { id: String(row._id), nameAr: row.nameAr,
      nameEn: row.nameEn, phone: row.phone, city: row.city, address: row.address }]));
    const debtors = [];
    const agingBuckets = [0, 0, 0, 0];
    let totalDebtSyp = 0, totalCreditSyp = 0, unknownAgeSyp = 0;
    for (const [pharmacyId, aged] of agedAccounts) {
      unknownAgeSyp += aged.unknownAgeSyp; totalDebtSyp += aged.debtSyp; totalCreditSyp += aged.creditSyp;
      aged.buckets.forEach((amount, index) => { agingBuckets[index] += amount; });
      if (aged.overdueSyp > 0) debtors.push({ pharmacy: named.get(pharmacyId) || { id: pharmacyId, nameAr: 'صيدلية غير متاحة', nameEn: 'Unavailable pharmacy', phone: null }, ...aged });
    }
    const inactive = [];
    for (const [pharmacyId, row] of activity) {
      const since = row.lastOrderAt || row.assignedAt;
      if (!since) continue;
      const days = Math.max(0, dayNumber(now) - dayNumber(since));
      if (days >= settings.inactiveDays && named.has(pharmacyId)) {
        inactive.push({ pharmacy: named.get(pharmacyId), days, lastOrderAt: row.lastOrderAt || null,
          assignedAt: row.assignedAt || null });
      }
    }
    const overdue = debtors.filter((row) => row.pharmacy).sort((a, b) =>
      b.oldestAgeDays - a.oldestAgeDays || b.overdueSyp - a.overdueSyp || a.pharmacy.id.localeCompare(b.pharmacy.id));
    inactive.sort((a, b) => b.days - a.days || a.pharmacy.id.localeCompare(b.pharmacy.id));
    return { asOf: now, settings, source: [...movements.values()], overdue, inactive, operational: { pendingOrders, pendingReturns },
      aging: { buckets: agingBuckets, totalDebtSyp, totalCreditSyp, unknownAgeSyp,
        overdueSyp: overdue.reduce((sum, row) => sum + row.overdueSyp, 0), overduePharmacies: overdue.length } };
  });
}
async function snapshotFor(warehouseId, { force = false, now = new Date() } = {}) {
  const key = String(warehouseId);
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.at < TTL) return cached.pending;
  const pending = loadSnapshot(warehouseId, now);
  const entry = { at: Date.now(), pending };
  cache.set(key, entry);
  // Bound snapshots on a long-lived server; never keep every warehouse forever.
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  try { return await pending; } catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
}

const MOVEMENTS = { charge: ['salesSyp', 1], charge_reversal: ['salesSyp', -1],
  payment: ['collectionsSyp', 1], payment_reversal: ['collectionsSyp', -1],
  return_credit: ['returnsSyp', 1], return_credit_reversal: ['returnsSyp', -1] };
function movementsFor(source, window) {
  const fromDate = businessDateOf(window.from), toDate = businessDateOf(window.to);
  const first = Date.parse(`${fromDate}T00:00:00Z`), last = Date.parse(`${toDate}T00:00:00Z`);
  if (last - first >= 366 * DAYS) throw ApiError.badRequest('Choose at most 366 days.', undefined, 'INVALID_PERIOD');
  const days = new Map();
  for (let instant = first; instant <= last; instant += DAYS) {
    const date = new Date(instant).toISOString().slice(0, 10);
    days.set(date, { date, salesSyp: 0, returnsSyp: 0, collectionsSyp: 0, netSalesSyp: 0 });
  }
  for (const row of source) {
    const day = days.get(row.date);
    if (day) for (const field of ['salesSyp', 'collectionsSyp', 'returnsSyp']) day[field] += row[field];
  }

  const daily = [...days.values()].map((day) => ({ ...day, netSalesSyp: day.salesSyp - day.returnsSyp }));
  const totals = daily.reduce((sum, day) => ({ salesSyp: sum.salesSyp + day.salesSyp,
    returnsSyp: sum.returnsSyp + day.returnsSyp, collectionsSyp: sum.collectionsSyp + day.collectionsSyp,
    netSalesSyp: sum.netSalesSyp + day.netSalesSyp }), { salesSyp: 0, returnsSyp: 0, collectionsSyp: 0, netSalesSyp: 0 });
  return { daily, totals };
}
async function report(warehouseId, query = {}, now = new Date()) {
  if (query.period === 'custom' && [query.from, query.to].some((date) => date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw ApiError.badRequest('Choose calendar dates for this report.', undefined, 'INVALID_PERIOD');
  }
  const window = resolveSummaryPeriod({ ...query, period: query.period || 'month' }, now);
  if (dayNumber(window.to) - dayNumber(window.from) >= 366) throw ApiError.badRequest('Choose at most 366 days.', undefined, 'INVALID_PERIOD');
  const snapshot = await snapshotFor(warehouseId, { force: query.force === '1', now });
  return { asOf: snapshot.asOf, timezone: BUSINESS_TIME_ZONE, period: window,
    ...movementsFor(snapshot.source, window), aging: snapshot.aging, settings: snapshot.settings };
}
function followUpPage(snapshot, kind, { limit = 20, after } = {}) {
  if (!['overdue', 'inactive'].includes(kind)) throw ApiError.badRequest('Invalid follow-up type.', undefined, 'INVALID_QUERY');
  const rows = snapshot[kind];
  let selected = rows;
  if (after) {
    let cursor;
    try { cursor = JSON.parse(after); } catch { /* checked below */ }
    if (!cursor || !Number.isFinite(cursor.days) || !Number.isFinite(cursor.amount) ||
        !mongoose.Types.ObjectId.isValid(cursor.id)) throw ApiError.badRequest('Invalid cursor.', undefined, 'INVALID_CURSOR');
    selected = rows.filter((row) => {
      const days = kind === 'overdue' ? row.oldestAgeDays : row.days;
      const amount = kind === 'overdue' ? row.overdueSyp : 0;
      return days < cursor.days || (days === cursor.days && (amount < cursor.amount || (amount === cursor.amount && row.pharmacy.id > cursor.id)));
    });
  }
  const page = selected.slice(0, limit);
  const last = page.at(-1);
  return { rows: page, total: rows.length, pagination: { hasMore: selected.length > limit,
    nextCursor: last ? JSON.stringify({ days: kind === 'overdue' ? last.oldestAgeDays : last.days,
      amount: kind === 'overdue' ? last.overdueSyp : 0, id: last.pharmacy.id }) : null } };
}
async function saveConfiguration(warehouseId, body) {
  const { overdueDays, inactiveDays, revision } = body || {};
  for (const days of [overdueDays, inactiveDays]) {
    if (!Number.isInteger(days) || days < 1 || days > 180) throw ApiError.badRequest('Days must be 1–180.', undefined, 'INVALID_FOLLOW_UP_SETTINGS');
  }
  if (!Number.isInteger(revision) || revision < 0) throw ApiError.badRequest('Invalid revision.', undefined, 'INVALID_FOLLOW_UP_SETTINGS');
  const updated = await Warehouse.findOneAndUpdate({ _id: warehouseId, ...(revision ? { 'followUp.revision': revision } : {
    $or: [{ 'followUp.revision': 0 }, { 'followUp.revision': { $exists: false } }],
  }) }, { $set: { followUp: { overdueDays, inactiveDays, revision: revision + 1 } } }, { new: true });
  if (!updated) throw ApiError.conflict('Follow-up settings changed; reload first.', 'FOLLOW_UP_CHANGED');
  invalidate(warehouseId);
  return configuration(updated);
}
module.exports = { report, snapshotFor, followUpPage, saveConfiguration, invalidate, movementsFor, DEFAULT_FOLLOW_UP };
