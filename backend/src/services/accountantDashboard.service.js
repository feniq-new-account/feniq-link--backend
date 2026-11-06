const mongoose = require('mongoose');
const LedgerEntry = require('../models/ledgerEntry.model');
const Pharmacy = require('../models/pharmacy.model');
const { ApiError } = require('../utils/ApiError');
const { financialReadSnapshot } = require('../utils/financialReadSnapshot');
const { getWarehouseSummary } = require('./warehouseSummary.service');
const { referenceFor } = require('./accountStatement.service');
const { toWarehouseSummaryResponse } = require('../viewmodels/accountStatement.viewmodel');

const ACTIVITY_LIMIT = 20;
function validateQuery(query) {
  if (Object.keys(query).some((key) => !['period', 'from', 'to', 'kind', 'pharmacyId'].includes(key)) ||
      (query.kind && !Object.hasOwn(LedgerEntry.ENTRY_KINDS, query.kind)) ||
      (query.pharmacyId && !mongoose.isObjectIdOrHexString(query.pharmacyId))) {
    throw ApiError.badRequest('Invalid dashboard filter.', undefined, 'INVALID_QUERY');
  }
}

// Basic accounting summary and activity, with the exact existing summary
// definitions. Activity filters never change the warehouse-wide KPI scope.
// No invoice payment allocation or collection-commission v2 is inferred here.
async function dashboard(warehouseId, query = {}, now = new Date()) {
  validateQuery(query);
  return financialReadSnapshot(async (session) => {
    const data = await getWarehouseSummary(warehouseId, query, now, session);
    const filter = { warehouseId, effectiveAt: { $gte: data.period.from, $lte: data.period.to } };
    if (query.kind) filter.kind = query.kind;
    if (query.pharmacyId) filter.pharmacyId = new mongoose.Types.ObjectId(query.pharmacyId);
    const entries = await LedgerEntry.find(filter)
      .select('pharmacyId entryNumber kind direction amountSyp effectiveAt postedAt source metadata.invoiceNumber metadata.orderNumber metadata.orderId metadata.paymentNumber metadata.method reversalOf reason')
      .sort({ effectiveAt: -1, entryNumber: -1 }).limit(ACTIVITY_LIMIT + 1).session(session).lean();
    const page = entries.slice(0, ACTIVITY_LIMIT);
    const pharmacies = await Pharmacy.find({ _id: { $in: page.map((row) => row.pharmacyId) } })
      .select('nameAr nameEn phone').session(session).lean();
    const names = new Map(pharmacies.map((row) => [String(row._id), row]));
    return {
      ...toWarehouseSummaryResponse(data),
      asOf: now, timezone: 'Asia/Damascus',
      activity: page.map((row) => ({
        id: row._id, entryNumber: row.entryNumber, pharmacyId: row.pharmacyId,
        pharmacy: names.get(String(row.pharmacyId)) || null,
        kind: row.kind, direction: row.direction, amountSyp: row.amountSyp,
        effectiveAt: row.effectiveAt, postedAt: row.postedAt,
        reference: referenceFor(row), reversalOf: row.reversalOf, reason: row.reason,
      })),
      activityHasMore: entries.length > ACTIVITY_LIMIT,
    };
  });
}
module.exports = { dashboard, ACTIVITY_LIMIT };
