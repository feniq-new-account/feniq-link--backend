const { asyncHandler } = require('../utils/asyncHandler');
const warehouseComplaintService = require('../services/warehouseComplaint.service');
const complaintViewModel = require('../viewmodels/complaint.viewmodel');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');

const COMPLAINTS_DEFAULT_LIMIT = 15;

const list = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const { limit, after } = parseCursorQuery(req.query, COMPLAINTS_DEFAULT_LIMIT);
  const cursor = parseObjectIdCursor(after);

  const { rows, hasMore, nextCursor } = await warehouseComplaintService.listComplaintsForWarehouse(
    warehouse._id,
    { status, limit, after: cursor }
  );
  res.json({
    success: true,
    ...complaintViewModel.toWarehouseComplaintListResponse(rows),
    pagination: paginationMeta(hasMore, nextCursor),
  });
});

const getOne = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id, { select: '_id', lean: true });
  const row = await warehouseComplaintService.getComplaintForWarehouse(req.params.id, warehouse._id);
  res.json({
    success: true,
    ...complaintViewModel.toWarehouseComplaintResponse(row),
  });
});

module.exports = { list, getOne };
