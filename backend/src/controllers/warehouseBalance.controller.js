const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const mongoose = require('mongoose');
const Order = require('../models/order.model');
const statementService = require('../services/accountStatement.service');
const summaryService = require('../services/warehouseSummary.service');
const statementViewModel = require('../viewmodels/accountStatement.viewmodel');
const paymentService = require('../services/payment.service');
const paymentViewModel = require('../viewmodels/payment.viewmodel');
const orderLedger = require('../services/orderLedger.service');
const invoiceViewModel = require('../viewmodels/invoice.viewmodel');
const { parseCursorQuery, paginationMeta } = require('../utils/pagination');
const { financialReadSnapshot } = require('../utils/financialReadSnapshot');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');

// Money-Flow V2. The warehouse's "Invoices" tab, now read from the ledger.
//
// V1 rebuilt this list by aggregating over the orders collection and looking
// up a separate PharmacyBalance cache per pharmacy. A ledger account exists
// precisely because something financial happened on it, so the accounts
// collection IS that list - no aggregation, and no possibility of a pharmacy
// appearing with a balance that disagrees with its own transactions.

// The cursor is a JSON-encoded { balanceSyp, id } pair: balance alone is a
// live, tie-prone value, so the id breaks ties without carrying meaning.
function parseAccountCursor(after) {
  if (after === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(after);
  } catch {
    throw ApiError.badRequest('Invalid cursor.', undefined, 'INVALID_CURSOR');
  }
  if (
    !parsed ||
    !Number.isSafeInteger(parsed.balanceSyp) ||
    typeof parsed.id !== 'string' ||
    !mongoose.Types.ObjectId.isValid(parsed.id)
  ) {
    throw ApiError.badRequest('Invalid cursor.', undefined, 'INVALID_CURSOR');
  }
  return parsed;
}

const list = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const { limit, after } = parseCursorQuery(req.query, 20);
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const { rows, hasMore, nextCursor } = await statementService.listAccountsForWarehouse(
    warehouse._id,
    { limit, after: parseAccountCursor(after), search, balanceState: req.query.balanceState }
  );
  res.json({
    success: true,
    ...statementViewModel.toWarehouseAccountsResponse({ rows }),
    pagination: paginationMeta(hasMore, nextCursor),
  });
});

// The owner's at-a-glance view: sales, collections, returns and outstanding
// debt for today / this week / this month (or a custom range).
const summary = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const data = await summaryService.getWarehouseSummary(warehouse._id, {
    period: typeof req.query.period === 'string' ? req.query.period : undefined,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ success: true, ...statementViewModel.toWarehouseSummaryResponse(data) });
});

// The per-pharmacy account: the chronological statement, plus the payment rows
// the panel needs in order to offer a reversal on each one.
const getOne = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const result = await financialReadSnapshot(async (session) => {
    const data = await statementService.getStatement({
      pharmacyId: req.params.pharmacyId, warehouseId: warehouse._id,
      from: req.query.from, to: req.query.to, session,
    });
    const filtered = Boolean(req.query.from || req.query.to);
    const payments = data.account ? await paymentService.listPaymentsForAccount(data.account._id,
      { ...(filtered ? data.period : {}), session }) : [];
    return { success: true, ...statementViewModel.toStatementResponse(data, 'warehouse'),
      payments: payments.map(paymentViewModel.serializePayment), paymentsScope: filtered ? 'period' : 'all' };
  });
  res.set('Cache-Control', 'no-store').json(result);
});

// The invoice for one of this warehouse's own delivered orders, including the
// platform commission and what the warehouse nets - figures the pharmacy's
// copy deliberately omits.
const invoice = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const order = await Order.findOne({ _id: req.params.orderId, warehouseId: warehouse._id });
  if (!order) {
    throw ApiError.notFound('Order not found.', 'ORDER_NOT_FOUND');
  }
  if (!order.invoiceNumber) {
    throw ApiError.badRequest(
      'This order has not been delivered yet, so it has no invoice.',
      undefined,
      'ORDER_NOT_INVOICED'
    );
  }
  const data = await orderLedger.buildInvoice(order);
  res.json({ success: true, ...invoiceViewModel.toInvoiceResponse(data, 'warehouse') });
});

module.exports = { list, summary, getOne, invoice };
