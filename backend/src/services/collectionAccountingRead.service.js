const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { rolePermissions } = require('../utils/rolePermissions');
const { warehouseForUserFilter } = require('../utils/loadWarehouse');
const { financialReadSnapshot } = require('../utils/financialReadSnapshot');
const { resolveSummaryPeriod } = require('./warehouseSummary.service');
const { resolveMatchingPharmacyIds } = require('./accountStatement.service');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Account = require('../models/ledgerAccount.model');
const Pharmacy = require('../models/pharmacy.model');
const Order = require('../models/order.model');
const Entry = require('../models/ledgerEntry.model');
const { Invoice, Position, Event, AllocationRun, ReturnCredit, ReturnCreditUse, ReturnCreditRelease } = require('../models/collectionAccounting.model');
const PAGE = 20;
function safe(value, signed = true) {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) throw ApiError.conflict('The accounting projection does not reconcile.', 'COLLECTION_ACCOUNT_RECONCILIATION_REQUIRED');
  return value;
}
function oid(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw ApiError.badRequest('Invalid collection accounting filter.', undefined, 'INVALID_COLLECTION_QUERY');
  return new mongoose.Types.ObjectId(String(value));
}
async function groupedSum(Model, filter, expression, session) {
  const [row] = await Model.aggregate([{ $match: filter }, { $group: { _id: null, value: { $sum: expression } } }]).session(session);
  return safe(row?.value ?? 0);
}
async function summary(warehouseId, period, session, accountId = null) {
  const warehouse = await Warehouse.findById(warehouseId).select('commissionEngine collectionContractRevision collectionContractId').session(session).lean();
  if (warehouse?.commissionEngine !== 'collection_v2') return null;
  const current = { warehouseId: oid(warehouseId), ...(accountId ? { accountId: Array.isArray(accountId) ? { $in: accountId.map(oid) } : oid(accountId) } : {}) };
  const [totals] = await Event.aggregate([{ $match: { ...current, at: { $gte: period.from, $lte: period.to } } },
    { $group: { _id: null, originalSyp: { $sum: '$originalCommissionSyp' }, feniqSyp: { $sum: '$feniqSyp' }, repSyp: { $sum: '$repSyp' },
      correctionsFeniqSyp: { $sum: { $min: [0, '$feniqSyp'] } } } },
  ]).session(session);
  const issued = await groupedSum(ReturnCredit, current, '$amountSyp', session);
  const reserved = await groupedSum(ReturnCreditUse, current, '$amountSyp', session);
  const released = await groupedSum(ReturnCreditRelease, current, '$amountSyp', session);
  const applied = await groupedSum(Entry, { ...current, kind: { $in: ['return_credit_application', 'return_credit_application_reversal'] } },
    { $cond: [{ $eq: ['$kind', 'return_credit_application'] }, '$amountSyp', { $multiply: [-1, '$amountSyp'] }] }, session);
  const states = await Position.aggregate([{ $match: current }, { $group: { _id: '$state', count: { $sum: 1 } } }]).session(session);
  return { model: 'collection_v2', contractRevision: warehouse.collectionContractRevision,
    contractId: warehouse.collectionContractId, period,
    originalSyp: safe(totals?.originalSyp ?? 0), feniqSyp: safe(totals?.feniqSyp ?? 0), repSyp: safe(totals?.repSyp ?? 0),
    correctionsFeniqSyp: safe(totals?.correctionsFeniqSyp ?? 0),
    returnCreditAvailableSyp: safe(issued - reserved + released, false),
    returnCreditLiabilitySyp: safe(issued - applied, false), returnCreditReservedSyp: safe(reserved - released - applied, false),
    invoiceStates: Object.fromEntries(['open', 'partial', 'paid', 'void'].map(state => [state, states.find(row => row._id === state)?.count ?? 0])),
    scope: { commission: 'selected_period_posted_events', returnCredit: 'current_unreserved_issued_credit', invoiceStates: 'current_all_dates' },
  };
}

async function journal(actorId, query = {}, adminWarehouseId = null) {
  if (Object.keys(query).some(k => !['period', 'from', 'to', 'after', 'invoiceAfter', 'pharmacyId', 'state', 'search', 'candidateAfter'].includes(k)) ||
      Object.values(query).some(value => typeof value !== 'string') ||
      (query.state && !['open', 'partial', 'paid', 'void'].includes(query.state)) || (query.search && query.search.length > 120)) {
    throw ApiError.badRequest('Invalid collection accounting filter.', undefined, 'INVALID_COLLECTION_QUERY');
  }
  const period = resolveSummaryPeriod({ period: 'month', ...query });
  const after = query.after ? oid(query.after) : null, invoiceAfter = query.invoiceAfter ? oid(query.invoiceAfter) : null;
  const pharmacyId = query.pharmacyId ? oid(query.pharmacyId) : null;
  const candidateAfter = query.candidateAfter ? oid(query.candidateAfter) : null;
  if (candidateAfter && !adminWarehouseId) throw ApiError.forbidden('Settlement evidence is platform scoped.');
  return financialReadSnapshot(async session => {
    const actor = await User.findById(oid(actorId)).select('role status warehouseRole').session(session).lean();
    if (!actor || actor.status !== 'active' || !rolePermissions(actor).financialRead || !['admin', 'warehouse'].includes(actor.role)) {
      throw ApiError.forbidden('Financial read access is required.');
    }
    const warehouse = actor.role === 'admin'
      ? await Warehouse.findById(oid(adminWarehouseId)).select('nameAr nameEn commissionEngine').session(session).lean()
      : await Warehouse.findOne(warehouseForUserFilter(actor._id)).select('nameAr nameEn commissionEngine').session(session).lean();
    if (!warehouse) throw ApiError.notFound('Warehouse not found.', 'WAREHOUSE_NOT_FOUND');
    let accountIds = null;
    if (pharmacyId || query.search?.trim()) {
      const accountFilter = { warehouseId: warehouse._id, ...(pharmacyId ? { pharmacyId } : {}) };
      if (query.search?.trim()) accountFilter.$and = [{ pharmacyId: { $in: await resolveMatchingPharmacyIds(query.search.trim(), session) } }];
      accountIds = (await Account.find(accountFilter).select('_id').session(session).lean()).map(a => a._id);
    }
    const filter = { warehouseId: warehouse._id, ...(accountIds ? { accountId: { $in: accountIds } } : {}) };
    const totals = await summary(warehouse._id, period, session, accountIds);
    const events = await Event.find({ ...filter, at: { $gte: period.from, $lte: period.to }, ...(after ? { _id: { $lt: after } } : {}) })
      .sort({ _id: -1 }).limit(PAGE + 1).session(session).lean();
    const invoicePage = await Position.find({ ...filter, ...(query.state ? { state: query.state } : {}), ...(invoiceAfter ? { _id: { $lt: invoiceAfter } } : {}) })
      .sort({ _id: -1 }).limit(PAGE + 1).session(session).lean();
    const positions = invoicePage.slice(0, PAGE), eventRows = events.slice(0, PAGE);
    const references = await Invoice.find({ warehouseId: warehouse._id,
      _id: { $in: [...eventRows.map(row => row.invoiceId), ...positions.map(row => row.invoiceId)] } }).session(session).lean();
    const allReferences = references, byInvoice = new Map(references.map(i => [String(i._id), i]));
    const names = await Pharmacy.find({ _id: { $in: allReferences.map(row => row.pharmacyId) } })
      .select('nameAr nameEn phone').session(session).lean();
    const orders = await Order.find({ warehouseId: warehouse._id, _id: { $in: allReferences.map(row => row.orderId) } })
      .select('orderNumber invoiceNumber').session(session).lean();
    const namesById = new Map(names.map(p => [String(p._id), p])), ordersById = new Map(orders.map(o => [String(o._id), o]));
    const runs = new Map();
    for (const position of positions) {
      const accountId = String(position.accountId);
      if (runs.has(accountId)) continue;
      const run = await AllocationRun.findOne({ accountId: position.accountId, warehouseId: warehouse._id }).sort({ revision: -1 }).select('_id ledgerSequence').session(session).lean();
      const current = await Account.findOne({ _id: position.accountId, warehouseId: warehouse._id }).select('seqCounter').session(session).lean();
      if (!run || current?.seqCounter !== run.ledgerSequence) throw ApiError.conflict('Allocation data requires reconciliation before display.', 'COLLECTION_ACCOUNT_RECONCILIATION_REQUIRED');
      runs.set(accountId, run);
    }
    const posted = await Event.aggregate([{ $match: { warehouseId: warehouse._id, invoiceId: { $in: positions.map(p => p.invoiceId) } } },
      { $group: { _id: '$invoiceId', originalCommissionSyp: { $sum: '$originalCommissionSyp' }, feniqSyp: { $sum: '$feniqSyp' }, repSyp: { $sum: '$repSyp' } } },
    ]).session(session);
    const postedById = new Map(posted.map(p => [String(p._id), p]));
    const rows = [];
    for (const position of positions) {
      const invoice = byInvoice.get(String(position.invoiceId)), currentRun = runs.get(String(position.accountId));
      const source = postedById.get(String(position.invoiceId));
      if (!invoice || String(position.allocationRunId) !== String(currentRun._id) ||
          ['originalCommissionSyp', 'feniqSyp', 'repSyp'].some(key => position[key] !== (source?.[key] ?? 0)) ||
          (position.state !== 'void' && safe(position.outstandingSyp + position.cashRecordedSyp + position.creditAppliedSyp + position.otherNonCashSyp) !== invoice.terms.invoiceSyp)) {
        throw ApiError.conflict('Invoice position differs from its posted sources.', 'COLLECTION_ACCOUNT_RECONCILIATION_REQUIRED');
      }
      rows.push({ id: invoice._id, orderId: invoice.orderId, orderNumber: ordersById.get(String(invoice.orderId))?.orderNumber ?? null,
        invoiceNumber: invoice.invoiceNumber, pharmacyId: invoice.pharmacyId, pharmacy: namesById.get(String(invoice.pharmacyId)) ?? null,
        deliveredAt: invoice.deliveredAt, invoiceSyp: invoice.terms.invoiceSyp, originalCommissionSyp: invoice.terms.originalCommissionSyp,
        netCommissionPotentialSyp: position.netCommissionPotentialSyp,
        outstandingSyp: position.outstandingSyp, cashRecordedSyp: position.cashRecordedSyp, creditAppliedSyp: position.creditAppliedSyp,
        otherNonCashSyp: position.otherNonCashSyp, eligibleCollectedSyp: position.eligibleCollectedSyp,
        accruedOriginalSyp: position.originalCommissionSyp, accruedFeniqSyp: position.feniqSyp, accruedRepSyp: position.repSyp,
        state: position.state,
      });
    }
    return { asOf: new Date(), timezone: 'Asia/Damascus', warehouse: { id: warehouse._id, nameAr: warehouse.nameAr, nameEn: warehouse.nameEn },
      summary: totals, period,
      ...(actor.role === 'admin' ? { settlementCandidates: await require('./collectionSettlementCandidates.service').read(warehouse._id, period, candidateAfter, session) } : {}),
      invoices: rows, invoiceScope: 'current_positions_all_dates',
      invoicePagination: { hasMore: invoicePage.length > PAGE, nextCursor: invoicePage.length > PAGE ? positions[positions.length - 1]._id : null },
      events: eventRows.map(row => { const invoice = byInvoice.get(String(row.invoiceId));
        return { id: row._id, at: row.at, invoiceId: row.invoiceId, orderId: invoice?.orderId ?? null,
          orderNumber: invoice ? ordersById.get(String(invoice.orderId))?.orderNumber ?? null : null,
          pharmacyId: invoice?.pharmacyId ?? null, pharmacy: invoice ? namesById.get(String(invoice.pharmacyId)) ?? null : null,
          originalCommissionSyp: row.originalCommissionSyp, feniqSyp: row.feniqSyp, repSyp: row.repSyp,
          targetOriginalCommissionSyp: row.targetOriginalCommissionSyp, targetFeniqSyp: row.targetFeniqSyp, targetRepSyp: row.targetRepSyp,
          reason: row.reason, sourceKey: row.sourceKey, allocationRunId: row.allocationRunId };
      }), pagination: { hasMore: events.length > PAGE, nextCursor: events.length > PAGE ? eventRows[eventRows.length - 1]._id : null },
    };
  });
}
module.exports = { summary, journal };
