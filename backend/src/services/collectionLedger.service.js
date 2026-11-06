const { ApiError } = require('../utils/ApiError');
const { scopeForArea } = require('../utils/collectionCommissionPolicy');
const LedgerEntry = require('../models/ledgerEntry.model');
const Payment = require('../models/payment.model');
const User = require('../models/user.model');
const ledger = require('./ledger.service');
const audit = require('./financialAudit.service');
const { Epoch, Invoice, Position, AllocationRun, Recognition, Event, ReturnAdjustment, ReturnCredit, ReturnCreditUse } = require('../models/collectionAccounting.model');
const invalid = () => ApiError.conflict('The account must reconcile with its ledger before commission posting.', 'COLLECTION_ACCOUNT_RECONCILIATION_REQUIRED');
function amount(value, signed = false) {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) throw invalid();
  return value;
}
function sessionRequired(session) {
  if (!session?.inTransaction()) throw new Error('Collection ledger writes require a transaction.');
}
function sum(values) {
  const total = values.reduce((n, value) => n + BigInt(amount(value, true)), 0n);
  return amount(Number(total), true);
}

// A metadata checkpoint of the EXISTING ledger, not an opening-balance entry
// or retrospective allocation. Old debt is kept as a labelled opening bucket;
// new cash must clear it before earning commission on newer invoices.
async function initializeAccount(accountId, warehouseId, session) {
  sessionRequired(session);
  const account = await ledger.lockAccountForFinancialChange(accountId, warehouseId, session);
  const existing = await Epoch.findOne({ accountId, warehouseId }).session(session).lean();
  if (existing) return existing;
  const entries = await LedgerEntry.find({ accountId }).select('amountSyp direction sequence').session(session).lean();
  const openingBalanceSyp = sum(entries.map(entry => amount(entry.amountSyp) * (entry.direction === 'debit' ? 1 : -1)));
  if (openingBalanceSyp !== account.balanceCache.syp || entries.reduce((max, e) => Math.max(max, e.sequence), 0) !== account.seqCounter) throw invalid();
  const [epoch] = await Epoch.create([{ accountId, warehouseId, openingSequence: account.seqCounter,
    openingBalanceSyp, at: new Date() }], { session });
  return epoch.toObject();
}

async function registerInvoice({ order, entry, account, deliveredAt }, session) {
  sessionRequired(session);
  if (order.commissionEngine !== 'collection_v2') return null;
  const terms = order.collectionCommission?.toObject?.() ?? order.collectionCommission;
  if (!terms || terms.invoiceSyp !== entry.amountSyp || entry.kind !== 'charge' || String(entry.accountId) !== String(account._id)) throw invalid();
  const existing = await Invoice.findOne({ orderId: order._id }).session(session).lean();
  if (existing) return existing;
  const [created] = await Invoice.create([{ accountId: account._id, warehouseId: order.warehouseId,
    pharmacyId: order.pharmacyId, orderId: order._id, chargeEntryId: entry._id, repId: order.repId ?? null,
    invoiceNumber: order.invoiceNumber, deliveredAt, terms, fx: order.fx?.toObject?.() ?? order.fx ?? null,
  }], { session });
  return created.toObject();
}

// Pure chronological replay. Reversals remove their target's effect, and the
// new immutable allocation version explains how surviving cash is reassigned.
// Already-paid invoices do not lose cash to a later unrelated manual credit.
function allocateFromEntries(epoch, entries, invoiceByCharge, activePaymentIds) {
  const entryIds = new Set(entries.map(e => String(e._id)));
  const reversed = new Set(entries.filter(e => e.reversalOf && entryIds.has(String(e.reversalOf))).map(e => String(e.reversalOf)));
  // A documented reversal of a pre-cutover event corrects the legacy opening
  // bucket in this NEW allocation version. It does not assign the old receipt
  // to any invoice, edit the epoch or let newer invoices jump old restored debt.
  const openingBalanceSyp = sum([epoch.openingBalanceSyp, ...entries.filter(e => e.reversalOf && !entryIds.has(String(e.reversalOf)))
    .map(e => amount(e.amountSyp) * (e.direction === 'debit' ? 1 : -1))]);
  const activeCharges = new Map(entries.filter(e => e.kind === 'charge' && !reversed.has(String(e._id)))
    .map(e => [String(e.source?.orderId), e]));
  const applications = entries.filter(e => e.kind === 'return_credit_application' && !reversed.has(String(e._id)));
  const principal = [], pools = [], allocations = [];
  if (openingBalanceSyp > 0) principal.push({ chargeEntryId: null, orderId: null,
    engine: 'legacy_opening', amountSyp: openingBalanceSyp, at: -Infinity, key: '' });
  if (openingBalanceSyp < 0) pools.push({ paymentId: null, amountSyp: -openingBalanceSyp });
  function apply(pool, targetOrderId = null) {
    const targets = principal.filter(p => p.amountSyp > 0).sort((a, b) =>
      (targetOrderId ? Number(String(b.orderId) === targetOrderId) - Number(String(a.orderId) === targetOrderId) : 0) ||
      a.at - b.at || a.key.localeCompare(b.key));
    for (const target of targets) {
      if (!pool.amountSyp) break;
      const applied = Math.min(target.amountSyp, pool.amountSyp);
      target.amountSyp -= applied; pool.amountSyp -= applied;
      allocations.push({ paymentId: pool.paymentId, chargeEntryId: target.chargeEntryId,
        orderId: target.orderId, engine: target.engine, amountSyp: applied });
    }
  }
  for (const entry of entries) {
    if (reversed.has(String(entry._id)) || entry.reversalOf) continue;
    const value = amount(entry.amountSyp);
    if (entry.kind === 'payment') {
      if (!activePaymentIds.has(String(entry.source?.paymentId))) continue;
      const pool = { paymentId: entry.source.paymentId, amountSyp: value };
      apply(pool); if (pool.amountSyp) pools.push(pool);
    } else if (entry.direction === 'debit') {
      const invoice = invoiceByCharge.get(String(entry._id));
      const credits = entry.kind === 'charge' ? applications.filter(a => String(a.source?.orderId) === String(entry.source?.orderId)) : [];
      const credited = sum(credits.map(a => a.amountSyp));
      if (credited > value) throw invalid();
      principal.push({ chargeEntryId: entry._id, orderId: entry.source?.orderId ?? null,
        engine: invoice ? 'collection_v2' : 'legacy', amountSyp: value - credited,
        at: entry.reversalOf ? -Infinity : new Date(entry.effectiveAt).getTime(), key: String(entry._id) });
      for (const credit of credits) allocations.push({ paymentId: null, chargeEntryId: entry._id,
        orderId: entry.source.orderId, returnCreditUseId: credit.source.returnCreditUseId,
        engine: invoice ? 'collection_v2' : 'legacy', amountSyp: credit.amountSyp });
      for (const pool of pools) apply(pool);
    } else {
      if (entry.kind === 'return_credit_application' && activeCharges.has(String(entry.source?.orderId))) continue;
      const pool = { paymentId: null, amountSyp: value };
      apply(pool, entry.metadata?.orderId ? String(entry.metadata.orderId) : null);
      if (pool.amountSyp) pools.push(pool);
    }
  }
  return { allocations, unapplied: pools.filter(p => p.amountSyp > 0),
    outstanding: principal.filter(p => p.amountSyp > 0).map(({ at, key, ...p }) => p) };
}

// Returned credit is a reuse of an existing source, never another cash receipt.
// Carry only the proportion backed by approved/settled source cash through an
// acyclic invoice lineage. Original returned commission was already removed.
// Cumulative rounding within each source/credit prevents one-lira duplication.
function eligibleFunding(invoices, allocations, eligiblePaymentIds, credits, uses, entries) {
  const reversed = new Set(entries.filter(e => e.reversalOf).map(e => String(e.reversalOf)));
  const activeChargeIds = new Set(entries.filter(e => e.kind === 'charge' && !reversed.has(String(e._id))).map(e => String(e._id)));
  const byOrder = new Map(invoices.map(i => [String(i.orderId), i]));
  const byId = new Map(invoices.map(i => [String(i._id), i]));
  const usesById = new Map(uses.map(u => [String(u._id), u]));
  const creditsById = new Map(credits.map(c => [String(c._id), c]));
  const applications = entries.filter(e => e.kind === 'return_credit_application' && !reversed.has(String(e._id)))
    .map(entry => {
      const use = usesById.get(String(entry.source?.returnCreditUseId));
      const credit = use && creditsById.get(String(use.creditId));
      const child = use && byOrder.get(String(use.orderId));
      if (!use || !credit || !child || String(entry.source.orderId) !== String(child.orderId) || !byId.has(String(credit.invoiceId))) throw invalid();
      return { entry, use, credit, child };
    }).sort((a, b) => String(a.use._id).localeCompare(String(b.use._id)));
  const result = new Map(), targets = new Map(), pending = new Map(invoices.map(i => [String(i._id), i]));
  const round = (n, d) => Number((2n * n + d) / (2n * d));
  while (pending.size) {
    let progressed = false;
    for (const [invoiceId, invoice] of pending) {
      const incoming = applications.filter(a => String(a.child._id) === invoiceId);
      if (incoming.some(a => !result.has(String(a.credit.invoiceId)))) continue;
      let funded = sum(allocations.filter(a => String(a.chargeEntryId) === String(invoice.chargeEntryId) &&
        a.paymentId && eligiblePaymentIds.has(String(a.paymentId))).map(a => a.amountSyp));
      let unconstrainedFunding = funded, compatibleCommissionBudget = 0;
      let roleCompatibleOriginalBudget = 0, roleCompatibleFeniqBudget = 0;
      for (const application of incoming) {
        const credit = application.credit, parentId = String(credit.invoiceId), parent = byId.get(parentId);
        const siblings = credits.filter(c => String(c.invoiceId) === parentId).sort((a, b) => String(a._id).localeCompare(String(b._id)));
        let priorGrants = 0, priorReturnedCommission = 0;
        for (const sibling of siblings) {
          if (String(sibling._id) === String(credit._id)) break;
          priorGrants += amount(sibling.amountSyp); priorReturnedCommission += amount(sibling.returnedCommissionSyp);
        }
        const cash = BigInt(result.get(parentId)), base = BigInt(parent.terms.invoiceSyp);
        const backed = base === 0n ? 0 : round(BigInt(priorGrants + credit.amountSyp) * cash, base) - round(BigInt(priorGrants) * cash, base);
        const parentTarget = targets.get(parentId);
        const beforePotential = parent.terms.originalCommissionSyp - priorReturnedCommission;
        const sourceBefore = parentTarget(beforePotential), sourceAfter = parentTarget(beforePotential - amount(credit.returnedCommissionSyp));
        const sourceCommissionBudget = amount(sourceBefore.originalCommissionSyp - sourceAfter.originalCommissionSyp);
        const sourceFeniqBudget = amount(sourceBefore.feniqSyp - sourceAfter.feniqSyp);
        if (sourceFeniqBudget > sourceCommissionBudget) throw invalid();
        const creditApps = applications.filter(a => String(a.credit._id) === String(credit._id));
        let priorUses = 0;
        for (const prior of creditApps) { if (String(prior.use._id) === String(application.use._id)) break; priorUses += amount(prior.entry.amountSyp); }
        if (priorUses + application.entry.amountSyp > credit.amountSyp) throw invalid();
        const sourceFunding = credit.amountSyp === 0 ? 0 : round(BigInt(priorUses + application.entry.amountSyp) * BigInt(backed), BigInt(credit.amountSyp)) -
          round(BigInt(priorUses) * BigInt(backed), BigInt(credit.amountSyp));
        const previousOriginal = credit.amountSyp === 0 ? 0 : round(BigInt(priorUses) * BigInt(sourceCommissionBudget), BigInt(credit.amountSyp));
        const cumulativeOriginal = credit.amountSyp === 0 ? 0 : round(BigInt(priorUses + application.entry.amountSyp) * BigInt(sourceCommissionBudget), BigInt(credit.amountSyp));
        const sourceBudget = cumulativeOriginal - previousOriginal;
        // Allocate beneficiary ownership by already-allocated commission units,
        // not independently by goods value. This keeps Feniq<=original and
        // preserves a city source's1/1 when split into two one-lira children.
        const sourceFeniq = sourceCommissionBudget === 0 ? 0 :
          round(BigInt(cumulativeOriginal) * BigInt(sourceFeniqBudget), BigInt(sourceCommissionBudget)) -
          round(BigInt(previousOriginal) * BigInt(sourceFeniqBudget), BigInt(sourceCommissionBudget));
        funded += sourceFunding;
        if (invoice.terms.originalRateBps === parent.terms.originalRateBps) {
          compatibleCommissionBudget += sourceBudget;
          if (scopeForArea(invoice.terms.areaType) === scopeForArea(parent.terms.areaType)) {
            roleCompatibleOriginalBudget += sourceBudget; roleCompatibleFeniqBudget += sourceFeniq;
          }
        } else unconstrainedFunding += sourceFunding; // an explicitly different frozen agreement rate
      }
      if (!activeChargeIds.has(String(invoice.chargeEntryId))) {
        funded = 0; unconstrainedFunding = 0; compatibleCommissionBudget = 0;
        roleCompatibleOriginalBudget = 0; roleCompatibleFeniqBudget = 0;
      }
      if (amount(funded) > invoice.terms.invoiceSyp) throw invalid();
      const fullPotential = amount(invoice.terms.originalCommissionSyp), invoiceSyp = amount(invoice.terms.invoiceSyp);
      const originalAt = potential => {
        amount(potential);
        if (potential > fullPotential) throw invalid();
        if (!invoiceSyp || !fullPotential) return 0;
        const unbounded = round(BigInt(potential) * BigInt(funded), BigInt(invoiceSyp));
        const bounded = round(BigInt(potential) * BigInt(unconstrainedFunding), BigInt(invoiceSyp)) +
          round(BigInt(potential) * BigInt(compatibleCommissionBudget), BigInt(fullPotential));
        return Math.min(unbounded, bounded);
      };
      const fullTarget = originalAt(fullPotential);
      const fullNewSplit = invoiceSyp === 0 ? 0 : round(BigInt(fullPotential) * BigInt(unconstrainedFunding), BigInt(invoiceSyp));
      const inheritedOriginal = compatibleCommissionBudget === 0 ? 0 : round(BigInt(fullTarget - fullNewSplit) *
        BigInt(roleCompatibleOriginalBudget), BigInt(compatibleCommissionBudget));
      targets.set(invoiceId, potential => {
        const originalCommissionSyp = originalAt(potential);
        const inherited = fullTarget === 0 ? 0 : round(BigInt(originalCommissionSyp) * BigInt(inheritedOriginal), BigInt(fullTarget));
        const inheritedFeniq = roleCompatibleOriginalBudget === 0 ? 0 : round(BigInt(inherited) *
          BigInt(roleCompatibleFeniqBudget), BigInt(roleCompatibleOriginalBudget));
        const newSplit = originalCommissionSyp - inherited;
        const feniqSyp = inheritedFeniq + (scopeForArea(invoice.terms.areaType) === 'outside' ? newSplit : round(BigInt(newSplit), 2n));
        return { originalCommissionSyp, feniqSyp, repSyp: originalCommissionSyp - feniqSyp };
      });
      result.set(invoiceId, funded); pending.delete(invoiceId); progressed = true;
    }
    if (!progressed) throw invalid(); // no cyclic or foreign credit provenance
  }
  return { funding: result, targets };
}

async function rebuildAccount({ accountId, warehouseId, actorId, sourceKey, reason }, session) {
  sessionRequired(session);
  if (!sourceKey || !reason?.trim()) throw new Error('Collection rebuild requires a source and reason.');
  const epoch = await Epoch.findOne({ accountId, warehouseId }).session(session).lean();
  if (!epoch) return null;
  const account = await ledger.lockAccountForFinancialChange(accountId, warehouseId, session);
  const existing = await AllocationRun.findOne({ accountId, sourceKey }).session(session).lean();
  if (existing) return existing;
  const entries = await LedgerEntry.find({ accountId, sequence: { $gt: epoch.openingSequence } }).sort({ sequence: 1 }).session(session).lean();
  const invoices = await Invoice.find({ accountId, warehouseId }).session(session).lean();
  const payments = await Payment.find({ accountId, warehouseId, kind: 'settlement', status: 'posted' }).select('_id').session(session).lean();
  const activePaymentIds = new Set(payments.map(p => String(p._id)));
  const projection = allocateFromEntries(epoch, entries, new Map(invoices.map(i => [String(i.chargeEntryId), i])), activePaymentIds);
  const balance = sum(projection.outstanding.map(p => p.amountSyp)) - sum(projection.unapplied.map(p => p.amountSyp));
  if (balance !== account.balanceCache.syp) throw invalid();
  const previous = await AllocationRun.findOne({ accountId }).sort({ revision: -1 }).session(session).lean();
  const run = await require('./collectionAllocationStorage.service').persistRun({ accountId, warehouseId, sourceKey, reason,
    actorId, at: session.financialOperationAt ?? new Date(), revision: (previous?.revision ?? 0) + 1, ledgerSequence: account.seqCounter,
    previousRunId: previous?._id ?? null,
  }, projection, session);
  const recognitions = await Recognition.find({ accountId, warehouseId }).session(session).lean();
  const eligible = new Set(recognitions.filter(r => activePaymentIds.has(String(r.paymentId))).map(r => String(r.paymentId)));
  const adjustments = await ReturnAdjustment.find({ accountId, warehouseId }).session(session).lean();
  const credits = await ReturnCredit.find({ accountId, warehouseId }).session(session).lean();
  const uses = await ReturnCreditUse.find({ accountId, warehouseId }).session(session).lean();
  const funding = eligibleFunding(invoices, projection.allocations, eligible, credits, uses, entries);
  const reversedCharges = new Set(entries.filter(e => e.kind === 'charge_reversal').map(e => String(e.reversalOf)));
  for (const invoice of invoices) {
    const collectedSyp = funding.funding.get(String(invoice._id));
    const returnedCommissionSyp = sum(adjustments.filter(a => String(a.invoiceId) === String(invoice._id)).map(a => a.returnedCommissionSyp));
    const terms = { invoiceSyp: invoice.terms.invoiceSyp, originalCommissionSyp: invoice.terms.originalCommissionSyp,
      areaType: invoice.terms.areaType, contractRef: invoice.terms.contractRef, deliveryFeeSyp: invoice.terms.deliveryFeeSyp };
    const potential = terms.originalCommissionSyp - returnedCommissionSyp;
    const target = funding.targets.get(String(invoice._id))(potential);
    const events = await Event.find({ invoiceId: invoice._id }).session(session).lean();
    const delta = Object.fromEntries(['originalCommissionSyp', 'feniqSyp', 'repSyp'].map(key => [key, target[key] - sum(events.map(e => e[key]))]));
    if (Object.values(delta).some(value => value !== 0)) await Event.create([{
      invoiceId: invoice._id, accountId, warehouseId, repId: invoice.repId ?? null, allocationRunId: run._id,
      sourceKey, actorId, reason, at: run.at, eligibleCollectedSyp: collectedSyp, returnedCommissionSyp,
      ...delta, targetOriginalCommissionSyp: target.originalCommissionSyp, targetFeniqSyp: target.feniqSyp, targetRepSyp: target.repSyp,
    }], { session });
    const allocated = projection.allocations.filter(row => String(row.chargeEntryId) === String(invoice.chargeEntryId));
    const outstandingSyp = sum(projection.outstanding.filter(row => String(row.chargeEntryId) === String(invoice.chargeEntryId)).map(row => row.amountSyp));
    const cashRecordedSyp = sum(allocated.filter(row => row.paymentId).map(row => row.amountSyp));
    const creditAppliedSyp = sum(allocated.filter(row => row.returnCreditUseId).map(row => row.amountSyp));
    const otherNonCashSyp = sum(allocated.filter(row => !row.paymentId && !row.returnCreditUseId).map(row => row.amountSyp));
    const voided = reversedCharges.has(String(invoice.chargeEntryId));
    if (!voided && sum([outstandingSyp, cashRecordedSyp, creditAppliedSyp, otherNonCashSyp]) !== invoice.terms.invoiceSyp) throw invalid();
    await Position.updateOne({ invoiceId: invoice._id }, { $set: {
      accountId, warehouseId, pharmacyId: invoice.pharmacyId, orderId: invoice.orderId,
      allocationRunId: run._id, ledgerSequence: run.ledgerSequence, invoiceSyp: invoice.terms.invoiceSyp,
      outstandingSyp: voided ? 0 : outstandingSyp, cashRecordedSyp, creditAppliedSyp, otherNonCashSyp,
      eligibleCollectedSyp: collectedSyp, ...target, asOf: run.at,
      netCommissionPotentialSyp: potential,
      state: voided ? 'void' : outstandingSyp === 0 ? 'paid' : outstandingSyp === invoice.terms.invoiceSyp ? 'open' : 'partial',
    } }, { upsert: true, session, runValidators: true });
  }
  const actor = await User.findById(actorId).select('role warehouseRole').session(session).lean();
  const ledgerSource = /^entry:([a-f0-9]{24})$/.exec(sourceKey);
  await audit.record({ action: 'commission.allocations_recorded', actorId, actorRole: actor?.role ?? null,
    ledgerEntryIds: ledgerSource ? [ledgerSource[1]] : [], entityType: 'CollectionAllocationRun',
    entityId: run._id, accountId, onBehalfOfWarehouseId: warehouseId, reason,
    after: { revision: run.revision, ledgerSequence: run.ledgerSequence, sourceKey,
      ...(actor?.warehouseRole ? { actorWarehouseRole: actor.warehouseRole } : {}) },
  }, session);
  return run.toObject();
}

module.exports = { initializeAccount, registerInvoice, rebuildAccount, allocateFromEntries, eligibleFunding };
