const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const LedgerAccount = require('../models/ledgerAccount.model');
const LedgerEntry = require('../models/ledgerEntry.model');
const Pharmacy = require('../models/pharmacy.model');
const Warehouse = require('../models/warehouse.model');
const ledger = require('./ledger.service');
const { financialReadSnapshot } = require('../utils/financialReadSnapshot');
const { escapeRegex } = require('./productCatalog.service');
const { parseRangeStart, parseRangeEnd } = require('../utils/businessTime');

// Money-Flow V2. The account statement: what a pharmacy owed, what it paid,
// what came back, and where that leaves the balance - in order, with a running
// total.
//
// V1 had no such thing. Its "debt detail" showed two disconnected lists (every
// delivered order, every payment) plus three summary cards computed on a
// different basis from the rows beneath them, so after any exchange-rate move
// the cards and the list visibly disagreed. Here every row and every total is
// the same frozen SYP figure off the same immutable entries, so they cannot.

const DEFAULT_STATEMENT_DAYS = 90;

function round2(amount) {
  return Math.round(amount * 100) / 100;
}

// A bare date is a whole local business day (utils/businessTime.js), the same
// rule as the settlement report: "to" a date includes all of that day.
function resolvePeriod({ from, to } = {}) {
  const now = new Date();
  const end = to ? parseRangeEnd(to) : now;
  const start = from
    ? parseRangeStart(from)
    : new Date(now.getTime() - DEFAULT_STATEMENT_DAYS * 24 * 60 * 60 * 1000);
  if (!start || !end || start > end) {
    throw ApiError.badRequest('Invalid statement period.', undefined, 'INVALID_PERIOD');
  }
  return { from: start, to: end };
}

// Every entry kind renders as one statement row. The `reference` is whatever a
// human would quote when asking about it - an invoice number, a payment
// number - and it comes from the entry's own frozen metadata rather than a
// join, so a statement never depends on the order or payment still looking the
// way it did.
function referenceFor(entry) {
  const meta = entry.metadata ?? {};
  switch (entry.kind) {
    case 'charge':
    case 'charge_reversal':
      return {
        invoiceNumber: meta.invoiceNumber ?? null,
        orderNumber: meta.orderNumber ?? null,
        orderId: entry.source?.orderId ?? null,
      };
    case 'payment':
    case 'payment_reversal':
      return {
        paymentNumber: meta.paymentNumber ?? null,
        method: meta.method ?? null,
        paymentId: entry.source?.paymentId ?? null,
      };
    case 'return_credit':
    case 'return_credit_reversal':
      return {
        returnId: entry.source?.returnId ?? null,
        // A credit belongs to the invoice it reduces, which is what makes it
        // legible on a statement ("RET against INV-1042").
        invoiceNumber: meta.invoiceNumber ?? null,
        orderNumber: meta.orderNumber ?? null,
        orderId: meta.orderId ?? null,
      };
    default:
      return {};
  }
}

function toRow(entry, runningSyp, runningUsd) {
  const isDebit = entry.direction === ledger.DEBIT;
  return {
    id: entry._id,
    entryNumber: entry.entryNumber,
    sequence: entry.sequence,
    kind: entry.kind,
    direction: entry.direction,
    effectiveAt: entry.effectiveAt,
    postedAt: entry.postedAt,
    // Split into two columns the way a statement reads, rather than one signed
    // number the reader has to interpret.
    debitSyp: isDebit ? entry.amountSyp : 0,
    creditSyp: isDebit ? 0 : entry.amountSyp,
    amountUsd: entry.amountUsd ?? null,
    balanceSyp: runningSyp,
    balanceUsd: runningUsd,
    reason: entry.reason ?? null,
    // A reversal names what it undid, so the mistake and the correction read
    // as a pair rather than two unexplained movements.
    reversalOf: entry.reversalOf ?? null,
    reference: referenceFor(entry),
  };
}

// The chronological statement for one (pharmacy, warehouse) account.
//
// Ordering is `effectiveAt` then `sequence` - the business date first, with the
// per-account sequence breaking same-day ties deterministically. Never
// wall-clock alone: a backdated payment has to land on the day the money moved,
// not the day someone typed it in.
async function getStatement({ pharmacyId, warehouseId, from, to, session = null }) {
  if (!session) return financialReadSnapshot((readSession) =>
    getStatement({ pharmacyId, warehouseId, from, to, session: readSession }));
  const asOf = new Date();
  if (
    !mongoose.Types.ObjectId.isValid(pharmacyId) ||
    !mongoose.Types.ObjectId.isValid(warehouseId)
  ) {
    throw ApiError.notFound('Account not found.', 'ACCOUNT_NOT_FOUND');
  }

  const period = resolvePeriod({ from, to });

  const account = await ledger.findAccount(pharmacyId, warehouseId, session);
  const pharmacy = await Pharmacy.findById(pharmacyId).select('nameAr nameEn phone').session(session).lean();
  const warehouse = await Warehouse.findById(warehouseId).select('nameAr nameEn phone').session(session).lean();

  if (!pharmacy || !warehouse) {
    throw ApiError.notFound('Account not found.', 'ACCOUNT_NOT_FOUND');
  }

  // An account that has never traded is a legitimate, empty statement rather
  // than a 404 - the same read-only zero fallback V1's getBalanceDetail gave.
  if (!account) {
    return {
      asOf,
      account: null,
      pharmacy,
      warehouse,
      period,
      opening: { syp: 0, usd: 0 },
      closing: { syp: 0, usd: 0 },
      rows: [],
      summary: emptySummary(),
      reconciliation: { netMovementSyp: 0, differenceSyp: 0, reconciled: true },
    };
  }

  const opening = await ledger.openingBalanceFor(account._id, period.from, session);
  const entries = await ledger.listEntriesForAccount(account._id, { ...period, session });

  let runningSyp = opening.syp;
  let runningUsd = opening.usd;
  const rows = entries.map((entry) => {
    runningSyp += ledger.signedSyp(entry);
    runningUsd += ledger.signedUsd(entry);
    return toRow(entry, Math.round(runningSyp), round2(runningUsd));
  });

  return {
    asOf,
    account,
    pharmacy,
    warehouse,
    period,
    opening,
    closing: { syp: Math.round(runningSyp), usd: round2(runningUsd) },
    rows,
    summary: summarize(entries),
    reconciliation: {
      netMovementSyp: Math.round(runningSyp - opening.syp),
      differenceSyp: Math.round(runningSyp) - opening.syp - entries.reduce((sum, entry) => sum + ledger.signedSyp(entry), 0),
      reconciled: Math.round(runningSyp) === opening.syp + entries.reduce((sum, entry) => sum + ledger.signedSyp(entry), 0),
    },
  };
}

function emptySummary() {
  return {
    chargesSyp: 0,
    paymentsSyp: 0,
    returnCreditsSyp: 0,
    adjustmentsSyp: 0,
    entryCount: 0,
  };
}

// The period's movement, grouped the way a reader asks about it: what was
// billed, what was paid, what came back, and anything else. Reversals are
// netted into the family they belong to, so a payment that was reversed
// shows the pair's true effect rather than inflating both columns.
function summarize(entries) {
  const summary = emptySummary();
  for (const entry of entries) {
    const amount = entry.amountSyp;
    switch (entry.kind) {
      case 'charge':
        summary.chargesSyp += amount;
        break;
      case 'charge_reversal':
        summary.chargesSyp -= amount;
        break;
      case 'payment':
        summary.paymentsSyp += amount;
        break;
      case 'payment_reversal':
        summary.paymentsSyp -= amount;
        break;
      case 'return_credit':
        summary.returnCreditsSyp += amount;
        break;
      case 'return_credit_reversal':
        summary.returnCreditsSyp -= amount;
        break;
      case 'manual_credit':
        summary.adjustmentsSyp -= amount;
        break;
      case 'manual_debit':
        summary.adjustmentsSyp += amount;
        break;
      default:
        summary.adjustmentsSyp += entry.direction === ledger.DEBIT ? amount : -amount;
    }
    summary.entryCount += 1;
  }
  return summary;
}

// Every account this pharmacy holds, plus the three headline figures.
//
// V1 answered "how much do I owe" with a single number that silently dropped
// every credit balance, so a pharmacy $100 down at one warehouse and $40 up at
// another was told it owed $100 with no sign of the $40. All three are
// computed here, server-side - the clients no longer fold balances themselves.
async function getPharmacyAccountsSummary(pharmacyId) {
  const accounts = await LedgerAccount.find({ pharmacyId })
    .select('warehouseId balanceCache lastActivityAt')
    .sort({ 'balanceCache.syp': -1 })
    .lean();

  const warehouses = await Warehouse.find({
    _id: { $in: accounts.map((a) => a.warehouseId) },
  })
    .select('nameAr nameEn phone')
    .lean();
  const warehouseById = new Map(warehouses.map((w) => [String(w._id), w]));

  let totalDebtSyp = 0;
  let totalCreditSyp = 0;
  let netPositionSyp = 0;

  const rows = accounts
    .map((account) => {
      const syp = account.balanceCache.syp;
      totalDebtSyp += Math.max(0, syp);
      totalCreditSyp += Math.max(0, -syp);
      netPositionSyp += syp;
      return {
        accountId: account._id,
        warehouse: warehouseById.get(String(account.warehouseId)) ?? null,
        warehouseId: account.warehouseId,
        balanceSyp: syp,
        balanceUsd: round2(account.balanceCache.usd),
        lastActivityAt: account.lastActivityAt,
      };
    })
    .filter((row) => row.warehouse !== null);

  return {
    totals: { totalDebtSyp, totalCreditSyp, netPositionSyp },
    rows,
  };
}

const WAREHOUSE_ACCOUNTS_DEFAULT_LIMIT = 20;

// The warehouse's own list of the pharmacies it trades with, highest balance
// first. Sourced from the ledger accounts themselves rather than V1's
// aggregation over the orders collection: an account exists precisely because
// something financial happened on it, which is the same set that aggregation
// was reconstructing the long way round.
//
// A pharmacy's name lives on Pharmacy, not LedgerAccount, so a name search
// is resolved to ids first, same two-step every name search across a join in
// this app uses (see offer.service.js's buildOfferSearchOr).
async function resolveMatchingPharmacyIds(searchTerm, session = null) {
  const pattern = new RegExp(escapeRegex(searchTerm), 'i');
  const matches = await Pharmacy.find({ $or: [{ nameAr: pattern }, { nameEn: pattern }, { phone: pattern }] }, '_id').session(session);
  return matches.map((p) => p._id);
}

// The cursor is the pair (balanceSyp, accountId) - balance alone is a live,
// tie-prone value, so the id breaks ties without carrying meaning of its own.
// `search` (pharmacy name) and the cursor each carry their own top-level $or,
// so they are pushed as separate clauses and $and-ed together rather than
// written into one plain object, where the second $or key would silently
// overwrite the first - same reasoning as offer.service.js's
// buildOfferListFilter.
async function listAccountsForWarehouse(
  warehouseId,
  { limit = WAREHOUSE_ACCOUNTS_DEFAULT_LIMIT, after = null, search, balanceState } = {}
) {
  const clauses = [{ warehouseId }];
  if (balanceState && !['debt', 'credit', 'settled'].includes(balanceState)) {
    throw ApiError.badRequest('Invalid account balance state.', undefined, 'INVALID_QUERY');
  }
  if (balanceState) clauses.push({ 'balanceCache.syp': balanceState === 'debt' ? { $gt: 0 }
    : balanceState === 'credit' ? { $lt: 0 } : 0 });

  if (after !== null) {
    clauses.push({
      $or: [
        { 'balanceCache.syp': { $lt: after.balanceSyp } },
        {
          'balanceCache.syp': after.balanceSyp,
          _id: { $gt: new mongoose.Types.ObjectId(String(after.id)) },
        },
      ],
    });
  }

  if (typeof search === 'string' && search.trim()) {
    const pharmacyIds = await resolveMatchingPharmacyIds(search.trim());
    clauses.push({ pharmacyId: { $in: pharmacyIds } });
  }

  const filter = clauses.length === 1 ? clauses[0] : { $and: clauses };

  const accounts = await LedgerAccount.find(filter)
    .select('pharmacyId balanceCache lastActivityAt')
    .sort({ 'balanceCache.syp': -1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = accounts.length > limit;
  const page = hasMore ? accounts.slice(0, limit) : accounts;
  const nextCursor =
    page.length > 0
      ? JSON.stringify({
          balanceSyp: page[page.length - 1].balanceCache.syp,
          id: String(page[page.length - 1]._id),
        })
      : null;

  const pharmacies = await Pharmacy.find({ _id: { $in: page.map((a) => a.pharmacyId) } })
    .select('nameAr nameEn phone')
    .lean();
  const pharmacyById = new Map(pharmacies.map((p) => [String(p._id), p]));

  // What each pharmacy bought and paid, from the ledger: delivered charges
  // (less reversed ones) and payments (less reversed ones), plus the date of
  // the latest payment.
  const totals = await LedgerEntry.aggregate([
    {
      $match: {
        accountId: { $in: page.map((a) => a._id) },
        kind: { $in: ['charge', 'charge_reversal', 'payment', 'payment_reversal'] },
      },
    },
    {
      $group: {
        _id: '$accountId',
        purchasesSyp: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ['$kind', 'charge'] }, then: '$amountSyp' },
                { case: { $eq: ['$kind', 'charge_reversal'] }, then: { $multiply: ['$amountSyp', -1] } },
              ],
              default: 0,
            },
          },
        },
        paidSyp: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ['$kind', 'payment'] }, then: '$amountSyp' },
                { case: { $eq: ['$kind', 'payment_reversal'] }, then: { $multiply: ['$amountSyp', -1] } },
              ],
              default: 0,
            },
          },
        },
        lastPaymentAt: { $max: { $cond: [{ $eq: ['$kind', 'payment'] }, '$effectiveAt', null] } },
      },
    },
  ]);
  const totalsByAccount = new Map(totals.map((t) => [String(t._id), t]));

  const rows = page
    .map((account) => ({
      accountId: account._id,
      pharmacyId: account.pharmacyId,
      pharmacy: pharmacyById.get(String(account.pharmacyId)) ?? null,
      balanceSyp: account.balanceCache.syp,
      balanceUsd: round2(account.balanceCache.usd),
      lastActivityAt: account.lastActivityAt,
      purchasesSyp: totalsByAccount.get(String(account._id))?.purchasesSyp ?? 0,
      paidSyp: totalsByAccount.get(String(account._id))?.paidSyp ?? 0,
      lastPaymentAt: totalsByAccount.get(String(account._id))?.lastPaymentAt ?? null,
    }))
    .filter((row) => row.pharmacy !== null);

  return { rows, hasMore, nextCursor };
}

module.exports = {
  getStatement,
  getPharmacyAccountsSummary,
  listAccountsForWarehouse,
  resolvePeriod,
  referenceFor,
  resolveMatchingPharmacyIds,
};
