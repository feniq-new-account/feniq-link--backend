const { asyncHandler } = require('../utils/asyncHandler');
const service = require('../services/adminDiscountCode.service');
const viewModel = require('../viewmodels/discountCode.viewmodel');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

function queryString(value) {
  return typeof value === 'string' ? value : undefined;
}

// ?view=review|admin|all, plus status / search / warehouseId - always
// cursor-paginated.
const list = asyncHandler(async (req, res) => {
  const { limit, after } = parseCursorQuery(req.query, 20);
  const { rows, hasMore, nextCursor, reviewCount } = await service.listCodes({
    view: queryString(req.query.view) || 'all',
    status: queryString(req.query.status),
    search: queryString(req.query.search),
    warehouseId: queryString(req.query.warehouseId),
    limit,
    after: parseObjectIdCursor(after),
  });
  res.json({
    success: true,
    ...viewModel.toDiscountCodeListResponse(rows),
    pagination: paginationMeta(hasMore, nextCursor),
    reviewCount,
  });
});

const create = asyncHandler(async (req, res) => {
  const codeDoc = await service.createCode(req.user._id, req.body);
  res.status(201).json({ success: true, message: 'Discount code created.', ...viewModel.toDiscountCodeResponse(codeDoc) });
});

// `version`: the code version the admin was looking at (409
// DISCOUNT_CODE_VERSION_CONFLICT if it changed since).
const update = asyncHandler(async (req, res) => {
  const codeDoc = await service.updateCode(req.params.id, req.body, { expectedVersion: req.body?.version });
  res.json({ success: true, message: 'Discount code updated.', ...viewModel.toDiscountCodeResponse(codeDoc) });
});

const approve = asyncHandler(async (req, res) => {
  const codeDoc = await service.approveCode(req.params.id, req.user._id, { expectedVersion: req.body?.version });
  res.json({ success: true, message: 'Discount code approved.', ...viewModel.toDiscountCodeResponse(codeDoc) });
});

const reject = asyncHandler(async (req, res) => {
  const codeDoc = await service.rejectCode(req.params.id, {
    note: req.body?.note,
    expectedVersion: req.body?.version,
  });
  res.json({ success: true, message: 'Discount code rejected.', ...viewModel.toDiscountCodeResponse(codeDoc) });
});

const stop = asyncHandler(async (req, res) => {
  const codeDoc = await service.stopCode(req.params.id, req.user._id);
  res.json({ success: true, message: 'Discount code stopped.', ...viewModel.toDiscountCodeResponse(codeDoc) });
});

module.exports = { list, create, update, approve, reject, stop };
