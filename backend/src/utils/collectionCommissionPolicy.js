const { ApiError } = require('./ApiError');
const VERSION = 'collection-2026-11-04';
const invalid = () => ApiError.badRequest('Invalid collection commission preview.', undefined, 'INVALID_COMMISSION_PREVIEW');
function integer(value, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw invalid();
  return value;
}
function scopeForArea(areaType) {
  if (areaType === 'city') return 'city';
  // Explicit owner confirmation in the implementation session, 2026-11-04.
  if (['city_ring', 'rural'].includes(areaType)) return 'outside';
  throw invalid();
}
function snapshotTerms(body) {
  if (!body || Object.keys(body).some(k => !['invoiceSyp', 'originalCommissionSyp', 'areaType', 'contractRef', 'deliveryFeeSyp'].includes(k))) throw invalid();
  const invoiceSyp = integer(body.invoiceSyp, true);
  const originalCommissionSyp = integer(body.originalCommissionSyp);
  if (originalCommissionSyp > invoiceSyp || typeof body.contractRef !== 'string' || !body.contractRef.trim() || body.contractRef.length > 500) throw invalid();
  const deliveryFeeSyp = body.deliveryFeeSyp === undefined || body.deliveryFeeSyp === null ? null : integer(body.deliveryFeeSyp);
  return Object.freeze({ policyVersion: VERSION, currency: 'SYP', invoiceSyp, originalCommissionSyp,
    scope: scopeForArea(body.areaType), areaType: body.areaType, contractRef: body.contractRef.trim(), deliveryFeeSyp });
}
function roundRatio(numerator, denominator) {
  // Cumulative half-up rounding in integer SYP, without floating intermediates.
  return Number((2n * numerator + denominator) / (2n * denominator));
}
function collectionEntitlement(terms, collectedSyp) {
  // Exported for the approved accounting policy. Revalidate monetary fields
  // and derive scope from area rather than trusting a caller-supplied split.
  terms = snapshotTerms({ invoiceSyp: terms?.invoiceSyp, originalCommissionSyp: terms?.originalCommissionSyp,
    areaType: terms?.areaType, contractRef: terms?.contractRef, deliveryFeeSyp: terms?.deliveryFeeSyp });
  integer(collectedSyp);
  if (collectedSyp > terms.invoiceSyp) throw invalid();
  const original = roundRatio(BigInt(terms.originalCommissionSyp) * BigInt(collectedSyp), BigInt(terms.invoiceSyp));
  const feniq = terms.scope === 'outside' ? original : roundRatio(BigInt(original), 2n);
  return { originalCommissionSyp: original, feniqSyp: feniq, repSyp: original - feniq, pharmacySyp: 0 };
}
function previewCollection(body) {
  if (!body || Object.keys(body).some(k => !['terms', 'collectedSyp', 'previousEligibleCollectedSyp', 'collector', 'proofReference', 'settlementConfirmed', 'returnPending'].includes(k))) throw invalid();
  const terms = snapshotTerms(body.terms);
  const previous = body.previousEligibleCollectedSyp === undefined ? 0 : integer(body.previousEligibleCollectedSyp);
  integer(body.collectedSyp);
  if (previous > body.collectedSyp || !['feniq', 'warehouse'].includes(body.collector) ||
      (body.settlementConfirmed !== undefined && typeof body.settlementConfirmed !== 'boolean') ||
      (body.returnPending !== undefined && typeof body.returnPending !== 'boolean') ||
      (body.proofReference !== undefined && (typeof body.proofReference !== 'string' || body.proofReference.length > 500))) throw invalid();
  if (body.returnPending) throw ApiError.conflict('Use the accounting return calculator with frozen return-commission amounts.', 'RETURN_POLICY_REVIEW_REQUIRED');
  const amount = collectionEntitlement(terms, body.collectedSyp);
  const before = collectionEntitlement(terms, previous);
  const eligible = body.collector === 'feniq' || Boolean(body.proofReference?.trim() && body.settlementConfirmed === true);
  return { previewOnly: true, persisted: false, terms, collectedSyp: body.collectedSyp,
    eligible, reason: eligible ? 'inputs_meet_collection_rule' : 'warehouse_evidence_and_settlement_required',
    cumulative: eligible ? amount : { originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0, pharmacySyp: 0 },
    increment: eligible ? { feniqSyp: amount.feniqSyp - before.feniqSyp, repSyp: amount.repSyp - before.repSyp } : { feniqSyp: 0, repSyp: 0 },
    rounding: 'cumulative_integer_syp_half_up', deliveryFeeSyp: terms.deliveryFeeSyp };
}

// Explicit manual allocation draft, never FIFO. Inputs are normalized integer
// SYP after a frozen FX conversion, never a live rate or a client balance.
function validateManualAllocations(body) {
  if (!body || Object.keys(body).some(key => !['paymentSyp', 'allocations'].includes(key))) throw invalid();
  const { paymentSyp, allocations } = body;
  integer(paymentSyp, true);
  if (!Array.isArray(allocations) || !allocations.length || allocations.length > 100) throw invalid();
  const ids = new Set();
  let total = 0n;
  for (const item of allocations) {
    if (!item || Object.keys(item).some(k => !['invoiceId', 'amountSyp'].includes(k)) ||
        typeof item.invoiceId !== 'string' || !item.invoiceId.trim() || item.invoiceId.length > 100 || ids.has(item.invoiceId)) throw invalid();
    ids.add(item.invoiceId); integer(item.amountSyp, true); total += BigInt(item.amountSyp);
  }
  if (total > BigInt(paymentSyp)) throw invalid();
  return { allocations: allocations.map(item => ({ ...item })), allocatedSyp: Number(total), unallocatedSyp: paymentSyp - Number(total) };
}
module.exports = { VERSION, scopeForArea, snapshotTerms, collectionEntitlement, previewCollection, validateManualAllocations };
