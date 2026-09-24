const { asyncHandler } = require('../utils/asyncHandler');
const catalogService = require('../services/productCatalog.service');
const catalogViewModel = require('../viewmodels/productCatalog.viewmodel');
const { suggestCatalogItems } = require('../services/warehouseImport.service');

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

module.exports = { search, suggestions };
