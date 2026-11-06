// Approved owner rules, 2026-11-06. Deterministic domain calculations ONLY.
// Inputs must come from authorized, transactionally locked persisted records.
// Neither this module nor a preview response constitutes proof approval.
const { ApiError } = require('./ApiError');
const { snapshotTerms, collectionEntitlement } = require('./collectionCommissionPolicy');

const POLICY_VERSION = 'collection-2026-11-06';
const invalid = () => ApiError.badRequest('Invalid collection accounting input.', undefined, 'INVALID_COLLECTION_ACCOUNTING');
function money(value, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw invalid();
  return value;
}
function date(value) {
  if (!(value instanceof Date) && typeof value !== 'string') throw invalid();
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw invalid();
  if (typeof value === 'string') {
    // Date() normalizes February30 into March. Validate the source calendar
    // date before timezone conversion, which may legitimately change its day.
    const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) throw invalid();
    if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) throw invalid();
  }
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw invalid();
  return result;
}
function reference(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 500) throw invalid();
  return value;
}
function only(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !fields.includes(k))) throw invalid();
}

// No manual invoice choice. Callers supply the COMPLETE eligible invoice set
// from the account's approved records; outstandingSyp is not a client balance.
// Historical payments without allocations cannot be guessed or backfilled.
function allocateOldestInvoices(body) {
  only(body, ['accountId', 'paymentSyp', 'invoices']);
  const accountId = reference(body.accountId);
  const paymentSyp = money(body.paymentSyp, true);
  if (!Array.isArray(body.invoices) || body.invoices.length > 10000) throw invalid();
  const seen = new Set();
  const invoices = body.invoices.map(row => {
    only(row, ['invoiceId', 'accountId', 'deliveredAt', 'outstandingSyp', 'engine']);
    const invoiceId = reference(row.invoiceId);
    if (seen.has(invoiceId) || row.accountId !== accountId || !['legacy', POLICY_VERSION].includes(row.engine)) throw invalid();
    seen.add(invoiceId);
    return { ...row, invoiceId, deliveredAt: date(row.deliveredAt), outstandingSyp: money(row.outstandingSyp) };
  }).sort((a, b) => a.deliveredAt - b.deliveredAt || (a.invoiceId < b.invoiceId ? -1 : a.invoiceId > b.invoiceId ? 1 : 0));
  let remainder = paymentSyp;
  const allocations = [];
  for (const row of invoices) {
    if (!remainder) break;
    const amountSyp = Math.min(remainder, row.outstandingSyp);
    if (!amountSyp) continue;
    allocations.push({ invoiceId: row.invoiceId, amountSyp, engine: row.engine });
    remainder -= amountSyp;
  }
  return { policyVersion: POLICY_VERSION, allocations, allocatedSyp: paymentSyp - remainder, unappliedSyp: remainder };
}

// Repeated partial receipts use cumulative entitlement, not a freshly rounded
// percentage for each receipt. Delivery fees never enter this calculation.
function collectionIncrement(body) {
  only(body, ['terms', 'previousCollectedSyp', 'collectedSyp']);
  const terms = snapshotTerms(body.terms);
  const previous = money(body.previousCollectedSyp);
  const collected = money(body.collectedSyp);
  if (previous > collected) throw invalid();
  const before = collectionEntitlement(terms, previous);
  const cumulative = collectionEntitlement(terms, collected);
  return {
    policyVersion: POLICY_VERSION,
    cumulative,
    increment: {
      originalCommissionSyp: cumulative.originalCommissionSyp - before.originalCommissionSyp,
      feniqSyp: cumulative.feniqSyp - before.feniqSyp,
      repSyp: cumulative.repSyp - before.repSyp,
      pharmacySyp: 0,
    },
  };
}

// Only the known return-commission amount from frozen contract/line records
// is accepted. Goods credit is NOT commission and is NOT automatically used
// against the original invoice. Partial-collection/return overlap is deliberately
// blocked until its allocation has an approved accounting treatment.
function returnCommissionCorrection(body) {
  only(body, ['terms', 'collectedSyp', 'previousReturnedCommissionSyp', 'returnedCommissionSyp', 'settlementId']);
  const terms = snapshotTerms(body.terms);
  const collectedSyp = money(body.collectedSyp);
  const previous = money(body.previousReturnedCommissionSyp);
  const returned = money(body.returnedCommissionSyp);
  if (previous > returned || returned > terms.originalCommissionSyp || collectedSyp > terms.invoiceSyp) throw invalid();
  if (collectedSyp !== 0 && collectedSyp !== terms.invoiceSyp) {
    throw ApiError.conflict('Partial collection and return require accounting review.', 'PARTIAL_RETURN_REVIEW_REQUIRED');
  }
  const settlementId = body.settlementId == null ? null : reference(body.settlementId);
  if (collectedSyp === 0 && settlementId) throw invalid();
  const before = collectionEntitlement({ ...terms, originalCommissionSyp: terms.originalCommissionSyp - previous }, terms.invoiceSyp);
  const after = collectionEntitlement({ ...terms, originalCommissionSyp: terms.originalCommissionSyp - returned }, terms.invoiceSyp);
  return {
    policyVersion: POLICY_VERSION,
    // Remaining potential before cash, or remaining entitlement after full cash.
    remaining: after,
    correction: collectedSyp === 0
      ? { originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0, pharmacySyp: 0 }
      : { originalCommissionSyp: after.originalCommissionSyp - before.originalCommissionSyp,
          feniqSyp: after.feniqSyp - before.feniqSyp, repSyp: after.repSyp - before.repSyp, pharmacySyp: 0 },
    treatment: collectedSyp === 0 ? 'reduce_future_entitlement' : settlementId ? 'offset_next_settlement' : 'correct_unsettled_entitlement',
    sourceSettlementId: settlementId,
  };
}

// A transfer may happen immediately; 24h is NOT a prohibition on early payment.
// Approval must not reset the clock. Weekly cadence is approved, but a week-end
// day/time has not been selected, so no invented weekly due date is returned.
function remittanceSchedule(body) {
  only(body, ['collector', 'paidAt']);
  const paidAt = date(body.paidAt);
  if (!['feniq', 'warehouse'].includes(body.collector)) throw invalid();
  if (body.collector === 'warehouse') return {
    policyVersion: POLICY_VERSION, collector: 'warehouse', paidAt: paidAt.toISOString(),
    cadence: 'weekly', calendarRequired: true, dueAt: null,
  };
  const target = new Date(paidAt.getTime() + 24 * 60 * 60 * 1000);
  const deadline = new Date(paidAt.getTime() + 48 * 60 * 60 * 1000);
  if (!Number.isFinite(target.getTime()) || !Number.isFinite(deadline.getTime())) throw invalid();
  return { policyVersion: POLICY_VERSION, collector: 'feniq', paidAt: paidAt.toISOString(),
    cadence: 'elapsed_hours', targetAt: target.toISOString(), dueAt: deadline.toISOString(), earlyTransferAllowed: true };
}

module.exports = { POLICY_VERSION, allocateOldestInvoices, collectionIncrement, returnCommissionCorrection, remittanceSchedule };
