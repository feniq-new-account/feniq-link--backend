const { asyncHandler } = require('../utils/asyncHandler');
const catalogService = require('../services/productCatalog.service');
const catalogViewModel = require('../viewmodels/productCatalog.viewmodel');
const { suggestCatalogItems } = require('../services/warehouseImport.service');
const catalogRequestService = require('../services/catalogRequest.service');
const catalogRequestViewModel = require('../viewmodels/catalogRequest.viewmodel');
const Warehouse = require('../models/warehouse.model');
const { ApiError } = require('../utils/ApiError');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

const search = asyncHandler(async (req, res) => {
  // `search` (was `q`) - unified with every other text-search endpoint.
  const items = await catalogService.searchActiveForWarehouse(req.query.search);
  res.json({ success: true, ...catalogViewModel.toCatalogListResponse(items) });
});

// The import review screen's live search: the top catalog matches for a
// (possibly misspelled) name and manufacturer, scored - see
// warehouseImport.service.js's suggestCatalogItems.
const suggestions = asyncHandler(async (req, res) => {
  const name = catalogService.optionalString(req.query.name, 'name');
  const manufacturer = catalogService.optionalString(req.query.manufacturer, 'manufacturer');
  const items = await suggestCatalogItems({ name, manufacturer });
  res.json({ success: true, suggestions: items });
});

const myRequests = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findOne({ userId: req.user._id }).select('_id').lean();
  if (!warehouse) throw ApiError.notFound('Warehouse profile not found.', 'WAREHOUSE_PROFILE_NOT_FOUND');
  const { limit, after } = parseCursorQuery(req.query, 30);
  const { rows, hasMore, nextCursor } = await catalogRequestService.listRequests({
    warehouseId: warehouse._id,
    limit,
    after: parseObjectIdCursor(after),
  });
  res.json({
    success: true,
    requests: rows.map(catalogRequestViewModel.serializeCatalogRequest),
    pagination: paginationMeta(hasMore, nextCursor),
  });
});

module.exports = { search, suggestions, myRequests };
