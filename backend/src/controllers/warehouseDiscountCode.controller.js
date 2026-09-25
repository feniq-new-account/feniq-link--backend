const { asyncHandler } = require('../utils/asyncHandler');
const service = require('../services/warehouseDiscountCode.service');
const viewModel = require('../viewmodels/discountCode.viewmodel');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');

function queryString(value) {
  return typeof value === 'string' ? value : undefined;
}

const list = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const { limit, after } = parseCursorQuery(req.query, 20);
  const { rows, hasMore, nextCursor, reviewCount } = await service.listCodes(warehouse._id, {
    status: queryString(req.query.status),
    search: queryString(req.query.search),
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
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const codeDoc = await service.createCode(warehouse._id, req.user._id, req.body);
  res.status(201).json({
    success: true,
    message: 'Discount code submitted for approval.',
    ...viewModel.toDiscountCodeResponse(codeDoc),
  });
});

// A pending code is edited in place; an approved code's edit waits for the
// admin (warehouseDiscountCode.service.updateCode).
const update = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const codeDoc = await service.updateCode(req.params.id, warehouse._id, req.body);
  res.json({
    success: true,
    message: 'Discount code update submitted.',
    ...viewModel.toDiscountCodeResponse(codeDoc),
  });
});

const stop = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const codeDoc = await service.stopCode(req.params.id, warehouse._id, req.user._id);
  res.json({ success: true, message: 'Discount code stopped.', ...viewModel.toDiscountCodeResponse(codeDoc) });
});

module.exports = { list, create, update, stop };
