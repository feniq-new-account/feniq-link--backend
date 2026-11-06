const { ApiError } = require('../utils/ApiError');
const { ReturnCredit, ReturnCreditUse, ReturnCreditRelease, ReturnAdjustment, Invoice } = require('../models/collectionAccounting.model');
const Order = require('../models/order.model');
const Entry = require('../models/ledgerEntry.model');
const ledger = require('./ledger.service');
const audit = require('./financialAudit.service');
const invalid = () => ApiError.conflict('Return credit does not reconcile with its source.', 'RETURN_CREDIT_RECONCILIATION_REQUIRED');
function money(value) { if (!Number.isSafeInteger(value) || value < 0) throw invalid(); return value; }
function roundRatio(numerator, denominator) { return Number((2n * numerator + denominator) / (2n * denominator)); }
function requireSession(session) { if (!session?.inTransaction()) throw new Error('Return credit requires a transaction.'); }

async function issue({ order, returnRequest, valuation, actorId }, session) {
  requireSession(session);
  const invoice = await Invoice.findOne({ orderId: order._id, warehouseId: order.warehouseId }).session(session).lean();
  if (!invoice) throw invalid();
  await ledger.lockAccountForFinancialChange(invoice.accountId, invoice.warehouseId, session);
  if (String(returnRequest.pharmacyId) !== String(invoice.pharmacyId) || String(returnRequest.warehouseId) !== String(invoice.warehouseId) ||
      await Entry.exists({ kind: 'charge_reversal', reversalOf: invoice.chargeEntryId }).session(session)) {
    throw ApiError.conflict('The source invoice is void or does not match this return.', 'RETURN_SOURCE_INVOICE_INVALID');
  }
  const existing = await ReturnCredit.findOne({ returnId: returnRequest._id }).session(session).lean();
  if (existing) return existing;
  const previous = await ReturnAdjustment.find({ invoiceId: invoice._id }).session(session).lean();
  const returnedGoodsSyp = previous.reduce((n, row) => n + row.goodsCreditSyp, 0) + money(valuation.creditSyp);
  if (!Number.isSafeInteger(returnedGoodsSyp) || returnedGoodsSyp > invoice.terms.invoiceSyp) throw invalid();
  const cumulativeCommission = invoice.terms.invoiceSyp === 0 ? 0 : roundRatio(
    BigInt(invoice.terms.originalCommissionSyp) * BigInt(returnedGoodsSyp), BigInt(invoice.terms.invoiceSyp));
  const returnedCommissionSyp = cumulativeCommission - previous.reduce((n, row) => n + row.returnedCommissionSyp, 0);
  money(returnedCommissionSyp);
  const [credit] = await ReturnCredit.create([{ accountId: invoice.accountId, warehouseId: invoice.warehouseId,
    pharmacyId: invoice.pharmacyId, invoiceId: invoice._id, returnId: returnRequest._id,
    amountSyp: valuation.creditSyp, amountUsd: valuation.creditUsd, fx: invoice.fx,
    returnedCommissionSyp, compensationClawbackSyp: money(valuation.breakdown?.compensationClawbackSyp ?? 0),
    issuedBy: actorId, issuedAt: returnRequest.resolvedAt ?? new Date(),
  }], { session });
  await ReturnAdjustment.create([{ invoiceId: invoice._id, warehouseId: invoice.warehouseId, accountId: invoice.accountId,
    returnId: returnRequest._id, goodsCreditSyp: valuation.creditSyp, returnedCommissionSyp,
    actorId, at: credit.issuedAt }], { session });
  await require('./collectionLedger.service').rebuildAccount({ accountId: invoice.accountId, warehouseId: invoice.warehouseId,
    actorId, sourceKey: `return:${returnRequest._id}`, reason: 'Warehouse approved returned goods; future credit issued',
  }, session);
  await audit.record({ action: 'commission.return_adjusted', actorId, actorRole: 'warehouse',
    entityType: 'CollectionReturnCredit', entityId: credit._id, accountId: invoice.accountId,
    reason: 'Warehouse approved return', after: { returnId: returnRequest._id, goodsCreditSyp: valuation.creditSyp,
      returnedCommissionSyp, treatment: 'future_invoice_or_exchange' },
  }, session);
  return credit.toObject();
}

async function activeUses(accountId, session) {
  const uses = await ReturnCreditUse.find({ accountId }).sort({ _id: 1 }).session(session).lean();
  const releases = await ReturnCreditRelease.find({ accountId }).session(session).lean();
  return uses.map(use => ({ ...use, activeSyp: money(use.amountSyp - releases.filter(r => String(r.useId) === String(use._id))
    .reduce((n, row) => n + row.amountSyp, 0)) }));
}

async function reserveForOrder(order, actorId, session) {
  requireSession(session);
  if (order.commissionEngine !== 'collection_v2' || order.status !== 'pending') return 0;
  const account = await ledger.findAccount(order.pharmacyId, order.warehouseId, session);
  if (!account) return 0;
  await ledger.lockAccountForFinancialChange(account._id, order.warehouseId, session);
  const uses = await activeUses(account._id, session);
  const previous = uses.filter(u => String(u.orderId) === String(order._id));
  if (previous.length) return previous.reduce((n, row) => n + row.activeSyp, 0);
  const credits = await ReturnCredit.find({ accountId: account._id, warehouseId: order.warehouseId })
    .sort({ issuedAt: 1, _id: 1 }).session(session).lean();
  let remaining = money(order.finalPrice), reserved = 0;
  for (const credit of credits) {
    if (!remaining) break;
    const used = uses.filter(u => String(u.creditId) === String(credit._id)).reduce((n, row) => n + row.activeSyp, 0);
    const available = money(credit.amountSyp - used);
    const amountSyp = Math.min(available, remaining);
    if (!amountSyp) continue;
    await ReturnCreditUse.create([{ accountId: account._id, warehouseId: order.warehouseId,
      creditId: credit._id, orderId: order._id, amountSyp, reservedBy: actorId, reservedAt: new Date() }], { session });
    remaining -= amountSyp; reserved += amountSyp;
  }
  if (reserved) await audit.record({ action: 'commission.return_credit_reserved', actorId,
    entityType: 'Order', entityId: order._id, accountId: account._id,
    reason: 'Approved return credit reserved for next invoice or exchange', after: { reservedSyp: reserved },
  }, session);
  return reserved;
}

async function releaseExcess(order, actorId, keepSyp, sourceKey, session) {
  requireSession(session); money(keepSyp);
  const account = await ledger.findAccount(order.pharmacyId, order.warehouseId, session);
  if (!account) return 0;
  await ledger.lockAccountForFinancialChange(account._id, order.warehouseId, session);
  const uses = (await activeUses(account._id, session)).filter(u => String(u.orderId) === String(order._id)).reverse();
  const total = uses.reduce((n, row) => n + row.activeSyp, 0);
  let excess = Math.max(0, total - keepSyp), released = 0;
  for (const use of uses) {
    const amountSyp = Math.min(excess, use.activeSyp);
    if (!amountSyp) continue;
    await ReturnCreditRelease.create([{ accountId: account._id, warehouseId: order.warehouseId,
      useId: use._id, amountSyp, actorId, at: new Date(), sourceKey,
      reason: 'Unused reservation released after order cancellation, resize or documented reversal' }], { session });
    released += amountSyp; excess -= amountSyp;
  }
  if (released) await audit.record({ action: 'commission.return_credit_released', actorId,
    entityType: 'Order', entityId: order._id, accountId: account._id, reason: sourceKey,
    after: { releasedSyp: released, remainingReservedSyp: total - released },
  }, session);
  if (order.status !== 'delivered') {
    order.returnCreditReservedSyp = total - released;
    await Order.updateOne({ _id: order._id, warehouseId: order.warehouseId },
      { $set: { returnCreditReservedSyp: order.returnCreditReservedSyp } }, { session });
  }
  return released;
}

async function applyForDelivery(order, account, actorId, deliveredAt, session) {
  requireSession(session);
  if (order.commissionEngine !== 'collection_v2') return;
  await ledger.lockAccountForFinancialChange(account._id, order.warehouseId, session);
  const uses = (await activeUses(account._id, session)).filter(u => String(u.orderId) === String(order._id) && u.activeSyp > 0);
  if (uses.reduce((n, u) => n + u.activeSyp, 0) > order.finalPrice) throw invalid();
  for (const use of uses) {
    if (await Entry.exists({ kind: 'return_credit_application', 'source.returnCreditUseId': use._id }).session(session)) continue;
    const credit = await ReturnCredit.findOne({ _id: use.creditId, accountId: account._id, warehouseId: order.warehouseId }).session(session).lean();
    if (!credit || credit.issuedAt > deliveredAt) throw invalid();
    const amountUsd = credit.fx?.rate ? Math.round(use.activeSyp / credit.fx.rate * 100) / 100 : null;
    await ledger.postEntry({ account, kind: 'return_credit_application', amountSyp: use.activeSyp, amountUsd,
      fx: credit.fx, effectiveAt: deliveredAt, createdBy: actorId,
      source: { orderId: order._id, returnId: credit.returnId, returnCreditUseId: use._id },
      metadata: { orderId: order._id, invoiceNumber: order.invoiceNumber, orderNumber: order.orderNumber,
        returnCreditId: credit._id, returnCreditUseId: use._id, originalInvoiceId: credit.invoiceId },
    }, session);
  }
}

async function reverseForVoidedInvoice(order, actorId, reason, session) {
  requireSession(session);
  if (order.commissionEngine !== 'collection_v2') return;
  const applications = await Entry.find({ kind: 'return_credit_application', 'source.orderId': order._id,
    warehouseId: order.warehouseId }).session(session);
  for (const entry of applications) {
    if (await Entry.exists({ reversalOf: entry._id }).session(session)) continue;
    await ledger.postReversal({ targetEntry: entry, createdBy: actorId, reason }, session);
  }
  await releaseExcess(order, actorId, 0, `void:${order._id}`, session);
}

module.exports = { issue, reserveForOrder, releaseExcess, applyForDelivery, reverseForVoidedInvoice, activeUses };
