const LedgerAccount = require('../models/ledgerAccount.model');
const LedgerEntry = require('../models/ledgerEntry.model');
const Pharmacy = require('../models/pharmacy.model');
const { ApiError } = require('../utils/ApiError');
const {
  businessDateOf,
  startOfBusinessDay,
  parseRangeStart,
  parseRangeEnd,
  startOfBusinessMonth,
} = require('../utils/businessTime');

// The warehouse owner's "how is the business doing" view, read from the same
// immutable ledger entries as every account statement - so the totals here
// are, by construction, the sum of what the statements show.
//
// Only DELIVERED orders appear: the ledger charge is posted on delivery, so an
// order still on its way is not yet a sale. The panels say so in their copy.

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_LIMIT = 3;
const PERIODS = ['today', 'week', 'month', 'custom'];

// Reversals net into the family they belong to (same rule as the statement's
// summary), so a payment recorded in error and then reversed counts as zero.
const SALES_KINDS = ['charge', 'charge_reversal'];
const NET = {
  charge: ['sales', 1],
  charge_reversal: ['sales', -1],
  payment: ['collections', 1],
  payment_reversal: ['collections', -1],
  return_credit: ['returns', 1],
  return_credit_reversal: ['returns', -1],
};

// "today" is the Syrian business day so far, "week" the last 7 business days
// including today, "month" from the 1st of the business month. "custom" takes
// bare dates (or timestamps) like every other report range.
function resolveSummaryPeriod({ period = 'today', from, to } = {}, now = new Date()) {
  if (!PERIODS.includes(period)) {
    throw ApiError.badRequest('Invalid summary period.', undefined, 'INVALID_PERIOD');
  }
  if (period === 'custom') {
    const start = parseRangeStart(from);
    const end = to ? parseRangeEnd(to) : now;
    if (!start || !end || start > end) {
      throw ApiError.badRequest('Invalid summary period.', undefined, 'INVALID_PERIOD');
    }
    return { period, from: start, to: end };
  }
  if (period === 'today') {
    return { period, from: startOfBusinessDay(businessDateOf(now)), to: now };
  }
  if (period === 'week') {
    const firstDay = businessDateOf(new Date(now.getTime() - 6 * DAY_MS));
    return { period, from: startOfBusinessDay(firstDay), to: now };
  }
  return { period, from: startOfBusinessMonth(now), to: now };
}

// The window of equal length that ends where this one begins - what "up or
// down compared to" means for a period of any length.
function previousWindow({ from, to }) {
  const length = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - length - 1), to: new Date(from.getTime() - 1) };
}

async function periodTotals(warehouseId, { from, to }, session = null) {
  const rows = await LedgerEntry.aggregate([
    {
      $match: {
        warehouseId,
        kind: { $in: Object.keys(NET) },
        effectiveAt: { $gte: from, $lte: to },
      },
    },
    { $group: { _id: '$kind', amountSyp: { $sum: '$amountSyp' }, count: { $sum: 1 } } },
  ]).session(session);

  const totals = {
    salesSyp: 0,
    collectionsSyp: 0,
    returnsSyp: 0,
    invoiceCount: 0,
    paymentCount: 0,
  };
  for (const row of rows) {
    const [family, sign] = NET[row._id];
    totals[`${family}Syp`] += sign * row.amountSyp;
    if (family === 'sales') totals.invoiceCount += sign * row.count;
    if (family === 'collections') totals.paymentCount += sign * row.count;
  }
  // New-model returned goods issue a future credit, not a reduction of the
  // original receivable. Count the approved goods value once at issuance;
  // its later use is a payment application and is NOT another goods return.
  const { ReturnCredit } = require('../models/collectionAccounting.model');
  const [issued] = await ReturnCredit.aggregate([{ $match: { warehouseId, issuedAt: { $gte: from, $lte: to } } },
    { $group: { _id: null, amountSyp: { $sum: '$amountSyp' } } },
  ]).session(session);
  if (issued?.amountSyp) {
    totals.returnsSyp += issued.amountSyp;
    totals.returnCreditIssuedSyp = issued.amountSyp;
  }
  return totals;
}

async function namesFor(pharmacyIds, session = null) {
  const pharmacies = await Pharmacy.find({ _id: { $in: pharmacyIds } })
    .select('nameAr nameEn phone')
    .session(session).lean();
  return new Map(pharmacies.map((p) => [String(p._id), p]));
}

function pharmacyRef(pharmacy) {
  return pharmacy
    ? { id: pharmacy._id, nameAr: pharmacy.nameAr, nameEn: pharmacy.nameEn, phone: pharmacy.phone }
    : null;
}

// Who bought the most in the window (net of reversed charges).
async function topBuyers(warehouseId, { from, to }, session = null) {
  const grouped = await LedgerEntry.aggregate([
    {
      $match: {
        warehouseId,
        kind: { $in: SALES_KINDS },
        effectiveAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: '$pharmacyId',
        salesSyp: {
          $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$amountSyp', { $multiply: ['$amountSyp', -1] }] },
        },
      },
    },
    { $match: { salesSyp: { $gt: 0 } } },
    { $sort: { salesSyp: -1, _id: 1 } },
    { $limit: TOP_LIMIT },
  ]).session(session);
  const names = await namesFor(grouped.map((g) => g._id), session);
  return grouped
    .map((g) => ({ pharmacy: pharmacyRef(names.get(String(g._id))), salesSyp: g.salesSyp }))
    .filter((row) => row.pharmacy !== null);
}

// Where the warehouse stands right now - independent of the chosen period,
// because a debt does not stop being owed when the day ends.
async function outstanding(warehouseId, session = null) {
  const [position] = await LedgerAccount.aggregate([
    { $match: { warehouseId } },
    {
      $group: {
        _id: null,
        totalDebtSyp: { $sum: { $max: [0, '$balanceCache.syp'] } },
        totalCreditSyp: { $sum: { $max: [0, { $multiply: ['$balanceCache.syp', -1] }] } },
        debtorCount: { $sum: { $cond: [{ $gt: ['$balanceCache.syp', 0] }, 1, 0] } },
      },
    },
  ]).session(session);

  const accounts = await LedgerAccount.find({ warehouseId, 'balanceCache.syp': { $gt: 0 } })
    .select('pharmacyId balanceCache lastActivityAt')
    .sort({ 'balanceCache.syp': -1, _id: 1 })
    .limit(TOP_LIMIT)
    .session(session).lean();
  const names = await namesFor(accounts.map((a) => a.pharmacyId), session);

  return {
    totalDebtSyp: position?.totalDebtSyp ?? 0,
    totalCreditSyp: position?.totalCreditSyp ?? 0,
    debtorCount: position?.debtorCount ?? 0,
    topDebtors: accounts
      .map((a) => ({
        pharmacy: pharmacyRef(names.get(String(a.pharmacyId))),
        balanceSyp: a.balanceCache.syp,
        lastActivityAt: a.lastActivityAt,
      }))
      .filter((row) => row.pharmacy !== null),
  };
}

async function getWarehouseSummary(warehouseId, query = {}, now = new Date(), session = null) {
  const window = resolveSummaryPeriod(query, now);
  // MongoDB sessions do not support parallel operations within a transaction.
  const tasks = [
    () => periodTotals(warehouseId, window, session),
    () => periodTotals(warehouseId, previousWindow(window), session),
    () => topBuyers(warehouseId, window, session),
    () => outstanding(warehouseId, session),
  ];
  const results = [];
  if (session) { for (const task of tasks) results.push(await task()); }
  else results.push(...await Promise.all(tasks.map((task) => task())));
  const [current, previous, buyers, position] = results;
  return { period: window, current, previous, topBuyers: buyers, outstanding: position };
}

module.exports = { getWarehouseSummary, resolveSummaryPeriod, previousWindow, PERIODS };
