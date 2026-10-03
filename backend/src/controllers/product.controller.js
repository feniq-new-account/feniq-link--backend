const { asyncHandler } = require('../utils/asyncHandler');
const productService = require('../services/product.service');
const productViewModel = require('../viewmodels/product.viewmodel');
const { getRate } = require('../services/exchangeRate.service');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

const PRODUCTS_DEFAULT_LIMIT = 20;

const list = asyncHandler(async (req, res) => {
  const { warehouseId } = req.params;
  const { search, categoryId, manufacturer } = req.query;
  const { limit, after } = parseCursorQuery(req.query, PRODUCTS_DEFAULT_LIMIT);
  const cursor = parseObjectIdCursor(after);

  const { items, hasMore, nextCursor } = await productService.listWarehouseProducts(warehouseId, {
    search,
    categoryId,
    manufacturer,
    limit,
    after: cursor,
  });
  // The rate every lira price in this response is computed at (Phase 7) -
  // read once for the whole page.
  const rate = await getRate();
  res.json({
    success: true,
    ...productViewModel.toProductListResponse(items, rate?.usdToSyp ?? null),
    pagination: paginationMeta(hasMore, nextCursor),
  });
});

const manufacturers = asyncHandler(async (req, res) => {
  const { warehouseId } = req.params;
  const items = await productService.listManufacturersWithDiscountsForWarehouse(warehouseId);
  res.json({ success: true, manufacturers: items });
});

const alternatives = asyncHandler(async (req, res) => {
  const { warehouseId, productId } = req.params;
  const items = await productService.listAlternatives(warehouseId, productId);
  const rate = await getRate();
  res.json({ success: true, ...productViewModel.toProductListResponse(items, rate?.usdToSyp ?? null) });
});

module.exports = { list, manufacturers, alternatives };
