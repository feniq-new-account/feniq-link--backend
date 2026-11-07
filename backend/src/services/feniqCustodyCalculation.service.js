const { requestFingerprint } = require('../utils/idempotency');
const { ApiError } = require('../utils/ApiError');
const Custody = require('../models/feniqCashCustody.model');
const Receipt = require('../models/feniqCollectionReceipt.model');
const Payment = require('../models/payment.model');
const Entry = require('../models/ledgerEntry.model');
const Account = require('../models/ledgerAccount.model');
const Order = require('../models/order.model');
const Contract = require('../models/collectionContract.model');
const { Remittance } = require('../models/feniqRemittance.model');
const { Epoch, Invoice, AllocationRun, Recognition, Event, ReturnAdjustment, ReturnCredit, ReturnCreditUse } = require('../models/collectionAccounting.model');
const { readProjection } = require('./collectionAllocationStorage.service');
const { eligibleFunding } = require('./collectionLedger.service');
const { invoiceSnapshot } = require('./collectionContract.service');
const MAX_SOURCES = 1000;
const sid = value => String(value);
function insufficient(code) { throw ApiError.conflict('Cash custody requires verified source reconciliation.', 'CUSTODY_' + code); }
function sum(values) {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) insufficient('NON_INTEGER_SOURCE');
    total += BigInt(value);
  }
  const result = Number(total);
  if (!Number.isSafeInteger(result)) insufficient('SOURCE_OVERFLOW');
  return result;
}
async function bounded(model, filter, session, sort = { _id: 1 }) {
  const rows = await model.find(filter).sort(sort).limit(MAX_SOURCES + 1).session(session).lean();
  if (rows.length > MAX_SOURCES) insufficient('SOURCE_LIMIT_EXCEEDED');
  return rows;
}

async function accountSources(accountId, warehouseId, custodies, session) {
  const account = await Account.findOne({ _id: accountId, warehouseId }).session(session).lean();
  const epoch = await Epoch.findOne({ accountId, warehouseId }).session(session).lean();
  const run = await AllocationRun.findOne({ accountId, warehouseId }).sort({ revision: -1 }).session(session).lean();
  if (!account || !epoch || !run || run.ledgerSequence !== account.seqCounter) insufficient('ALLOCATION_REQUIRED');
  const entries = await bounded(Entry, { accountId, warehouseId, sequence: { $gt: epoch.openingSequence } }, session, { sequence: 1 });
  const signed = entries.map(e => e.direction === 'debit' ? e.amountSyp : -e.amountSyp);
  if (sum([epoch.openingBalanceSyp, ...signed]) !== account.balanceCache.syp) insufficient('LEDGER_MISMATCH');
  const projection = await readProjection(run, session);
  if (projection.allocations.length > 10000) insufficient('SOURCE_LIMIT_EXCEEDED');
  const invoices = await bounded(Invoice, { accountId, warehouseId }, session);
  const payments = await bounded(Payment, { accountId, warehouseId, kind: 'settlement', status: 'posted' }, session);
  const recognitions = await bounded(Recognition, { accountId, warehouseId }, session);
  const adjustments = await bounded(ReturnAdjustment, { accountId, warehouseId }, session);
  const credits = await bounded(ReturnCredit, { accountId, warehouseId }, session);
  const uses = await bounded(ReturnCreditUse, { accountId, warehouseId }, session);
  const events = await bounded(Event, { accountId, warehouseId }, session);
  const receipts = await bounded(Receipt, { warehouseId, paymentId: { $in: custodies.map(c => c.paymentId) } }, session);
  const recognized = new Map(recognitions.map(r => [sid(r.paymentId), r]));
  const byPayment = new Map(payments.map(p => [sid(p._id), p]));
  const blockers = [];
  const blockNet = code => { if (!blockers.includes('CUSTODY_' + code)) blockers.push('CUSTODY_' + code); };
  const byInvoice = new Map(invoices.map(i => [sid(i.chargeEntryId), i]));
  const byCustody = new Map(custodies.map(c => [sid(c.paymentId), c]));
  for (const custody of custodies) {
    const payment = byPayment.get(sid(custody.paymentId));
    const receipt = receipts.find(r => sid(r._id) === sid(custody.receiptId));
    const recognition = recognized.get(sid(custody.paymentId));
    const entry = entries.find(e => sid(e._id) === sid(payment?.ledgerEntryId));
    if (!payment || !receipt || receipt.status !== 'approved' || sid(receipt.paymentId) !== sid(payment._id) ||
        !recognition || recognition.collector !== 'feniq' || !entry || entry.kind !== 'payment' ||
        sid(entry.source?.paymentId) !== sid(payment._id) || entry.amountSyp !== payment.amountSyp ||
        payment.amountSyp !== custody.grossHeldSyp || receipt.amountSyp !== custody.grossHeldSyp ||
        sid(payment.accountId) !== sid(accountId) || !payment.fx?.rate || receipt.fx?.rate !== payment.fx.rate) insufficient('RECEIPT_SOURCE_MISMATCH');
    const allocations = projection.allocations.filter(a => sid(a.paymentId) === sid(payment._id));
    if (allocations.some(a => a.engine !== 'collection_v2' || !byInvoice.has(sid(a.chargeEntryId)))) blockNet('LEGACY_TERMS_REQUIRED');
    if (sum(allocations.map(a => a.amountSyp)) !== payment.amountSyp) blockNet('UNALLOCATED_CASH');
  }
  // Attribute the exact existing cumulative engine targets to successive
  // recognized payments in ledger order. Prefix DIFFERENCES, never independently
  // rounded per-receipt percentages, preserve every lira and credit provenance.
  const ordered = entries.filter(e => e.kind === 'payment' && byPayment.has(sid(e.source?.paymentId)) && recognized.has(sid(e.source.paymentId)));
  const eligible = new Set();
  let previous = new Map(invoices.map(i => [sid(i._id), { originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0 }]));
  const breakdown = new Map(custodies.map(c => [sid(c.paymentId), { custodyId: c._id, receiptId: c.receiptId, paymentId: c.paymentId,
    grossHeldSyp: c.grossHeldSyp, originalCommissionSyp: 0, feniqSyp: 0, repSyp: 0, deliveryDeductedSyp: 0, allocations: [] }]));
  for (const entry of ordered) {
    const paymentId = sid(entry.source.paymentId);
    const recognition = recognized.get(paymentId);
    if (recognition.collector === 'feniq' && !byCustody.has(paymentId)) insufficient('MISSING_CUSTODY');
    eligible.add(paymentId);
    const funding = eligibleFunding(invoices, projection.allocations, eligible, credits, uses, entries);
    const next = new Map();
    for (const invoice of invoices) {
      const returned = sum(adjustments.filter(a => sid(a.invoiceId) === sid(invoice._id)).map(a => a.returnedCommissionSyp));
      const target = funding.targets.get(sid(invoice._id))(invoice.terms.originalCommissionSyp - returned);
      const before = previous.get(sid(invoice._id));
      next.set(sid(invoice._id), target);
      const custody = breakdown.get(paymentId);
      const cash = projection.allocations.filter(a => sid(a.paymentId) === paymentId && sid(a.chargeEntryId) === sid(invoice.chargeEntryId));
      if (!custody || (!cash.length && target.originalCommissionSyp === before.originalCommissionSyp)) continue;
      const contract = await Contract.findOne({ _id: invoice.terms.contractId, warehouseId, revision: invoice.terms.contractRevision }).session(session).lean();
      const order = await Order.findOne({ _id: invoice.orderId, warehouseId, pharmacyId: invoice.pharmacyId }).session(session).lean();
      const charge = entries.find(e => sid(e._id) === sid(invoice.chargeEntryId));
      if (!contract || !order || !charge || charge.amountSyp !== invoice.terms.invoiceSyp || !invoice.fx?.rate) insufficient('FROZEN_CONTRACT_REQUIRED');
      const expected = invoiceSnapshot(contract, { repId: invoice.repId, areaType: invoice.terms.areaType, invoiceSyp: charge.amountSyp });
      for (const key of ['policyVersion', 'contractRevision', 'contractRef', 'originalRateBps', 'originalCommissionSyp', 'deliveryFeeSyp']) {
        if (expected[key] !== invoice.terms[key]) insufficient('FROZEN_CONTRACT_MISMATCH');
      }
      // Existing contracts record an amount but no recipient/source for a
      // nonzero delivery fee. Do not invent its owner or mix it into commission.
      if (invoice.terms.deliveryFeeSyp > 0) blockNet('DELIVERY_BENEFICIARY_SOURCE_REQUIRED');
      if (order.discountCode?.fundedBy === 'platform' && order.discountCode.discountSyp > 0) blockNet('PLATFORM_COMPENSATION_SOURCE_REQUIRED');
      if (credits.some(c => sid(c.invoiceId) === sid(invoice._id) && c.compensationClawbackSyp > 0)) blockNet('PLATFORM_COMPENSATION_SOURCE_REQUIRED');
      const delta = Object.fromEntries(['originalCommissionSyp', 'feniqSyp', 'repSyp'].map(k => [k, target[k] - before[k]]));
      for (const key of Object.keys(delta)) custody[key] = sum([custody[key], delta[key]]);
      custody.allocations.push({ invoiceId: invoice._id, orderId: invoice.orderId, chargeEntryId: invoice.chargeEntryId,
        contractId: contract._id, contractRevision: contract.revision, agreementReference: contract.agreementReference,
        areaType: invoice.terms.areaType, amountSyp: sum(cash.map(a => a.amountSyp)), ...delta,
        fx: invoice.fx, recognitionId: recognition._id, deliveryTreatment: 'no_separate_fee_deducted' });
    }
    previous = next;
  }
  for (const invoice of invoices) {
    const target = previous.get(sid(invoice._id));
    for (const key of ['originalCommissionSyp', 'feniqSyp', 'repSyp']) {
      if (sum(events.filter(e => sid(e.invoiceId) === sid(invoice._id)).map(e => e[key])) !== target[key]) insufficient('COMMISSION_JOURNAL_MISMATCH');
    }
  }
  const rows = [...breakdown.values()].map(row => {
    if (row.originalCommissionSyp !== sum([row.feniqSyp, row.repSyp]) || row.originalCommissionSyp < 0 || row.originalCommissionSyp > row.grossHeldSyp) insufficient('COMMISSION_SPLIT_MISMATCH');
    return { ...row, netWarehouseDueSyp: blockers.length ? null : sum([row.grossHeldSyp, -row.originalCommissionSyp]) };
  });
  return { accountId, allocationRunId: run._id, allocationRevision: run.revision, allocationAt: run.at, ledgerSequence: run.ledgerSequence,
    openingSequence: epoch.openingSequence, rows, blockers, commissionReady: true, recognitionIds: recognitions.map(r => r._id),
    commissionEventIds: events.map(e => e._id), returnAdjustmentIds: adjustments.map(a => a._id),
    creditIds: credits.map(c => c._id), creditUseIds: uses.map(u => u._id) };
}

async function calculate(warehouseId, session) {
  const custodies = await bounded(Custody, { warehouseId }, session);
  const accounts = [], blockers = [];
  for (const accountId of [...new Set(custodies.map(c => sid(c.accountId)))].sort()) {
    try {
      const account = await accountSources(accountId, warehouseId, custodies.filter(c => sid(c.accountId) === accountId), session);
      accounts.push(account);
      blockers.push(...account.blockers.map(code => ({ accountId, code })));
    }
    catch (error) {
      if (typeof error.code !== 'string' || !error.code.startsWith('CUSTODY_')) throw error;
      blockers.push({ accountId, code: error.code });
    }
  }
  const movements = await bounded(Remittance, { warehouseId, status: { $in: ['confirmed', 'reversed'] } }, session);
  // Reversal rows are separate confirmed negative cash movements. The original
  // stays in history and is still counted once, even when marked reversed.
  const remittedSyp = sum(movements.map(r => r.kind === 'transfer' ? r.amountSyp : -r.amountSyp));
  const grossCollectedSyp = sum(custodies.map(c => c.grossHeldSyp));
  const rows = accounts.flatMap(a => a.rows);
  const totals = blockers.length ? { originalCommissionSyp: null, feniqSyp: null, repSyp: null, cumulativeWarehouseDueSyp: null, netWarehouseDueSyp: null }
    : { originalCommissionSyp: sum(rows.map(r => r.originalCommissionSyp)), feniqSyp: sum(rows.map(r => r.feniqSyp)),
      repSyp: sum(rows.map(r => r.repSyp)), cumulativeWarehouseDueSyp: sum(rows.map(r => r.netWarehouseDueSyp)),
      netWarehouseDueSyp: sum([...rows.map(r => r.netWarehouseDueSyp), -remittedSyp]) };
  const result = { policyVersion: 'feniq-custody-2026-11-07', warehouseId, ready: blockers.length === 0, blockers,
    grossCollectedSyp, remittedSyp, cashInCustodySyp: sum([grossCollectedSyp, -remittedSyp]), ...totals,
    accounts, confirmedMovementIds: movements.map(r => r._id), custodyIds: custodies.map(c => c._id) };
  return { result, sourceHash: requestFingerprint('feniq-custody-sources-v1', result) };
}
module.exports = { calculate, sum, insufficient, bounded };
