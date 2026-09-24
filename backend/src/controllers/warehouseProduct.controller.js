const { asyncHandler } = require('../utils/asyncHandler');
const warehouseProductService = require('../services/warehouseProduct.service');
const warehouseProductViewModel = require('../viewmodels/warehouseProduct.viewmodel');
const productCatalogService = require('../services/productCatalog.service');
const warehouseImportService = require('../services/warehouseImport.service');
const importBatchViewModel = require('../viewmodels/importBatch.viewmodel');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');
const { loadWarehouseOrThrow } = require('../utils/loadWarehouse');

// Always one page (catalog overhaul Phase 10, H4). It used to return every
// product the warehouse owns when no `limit` was sent - what the banner,
// offer and order-edit pickers relied on; they search page by page now
// (`search` below). No `limit` means the default page, capped at 100.
const list = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const { limit, after } = parseCursorQuery(req.query, 20);
  const cursor = parseObjectIdCursor(after);
  const { rows, hasMore, nextCursor } = await warehouseProductService.listPaginatedProductsForWarehouse(
    warehouse._id,
    {
      limit,
      after: cursor,
      manufacturerAr: req.query.manufacturer,
      availableOnly: req.query.available === 'true',
    }
  );
  res.json({
    success: true,
    ...warehouseProductViewModel.toProductListResponse(rows),
    pagination: paginationMeta(hasMore, nextCursor),
  });
});

// Always paginated (unlike `list` above): this backs the advertisement
// product picker, whose whole point is that a large catalog is searched
// server-side a page at a time rather than downloaded and filtered.
const search = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const { limit, after } = parseCursorQuery(req.query, 20);
  const cursor = parseObjectIdCursor(after);
  const { rows, hasMore, nextCursor } = await warehouseProductService.searchPaginatedProductsForWarehouse(
    warehouse._id,
    // `search` (was `q`) at the HTTP boundary - unified with every other
    // text-search endpoint. The service's own param is still named `q`
    // internally; only the wire-level query key changed.
    // `available=true`: only products a pharmacy could receive right now (the
    // order-edit "add item" picker).
    { q: req.query.search, limit, after: cursor, availableOnly: req.query.available === 'true' }
  );
  res.json({
    success: true,
    ...warehouseProductViewModel.toProductListResponse(rows),
    pagination: paginationMeta(hasMore, nextCursor),
  });
});

const create = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  // The price was converted from SYP in the panel - it must carry the rate it
  // used (exchangeRate.service.js's assertRateUsedIsCurrent).
  const product = await warehouseProductService.createProduct(warehouse._id, req.body, {
    requireRateUsed: true,
    userId: req.user._id,
  });
  // Adding a medicine the warehouse had disabled itself re-enables that
  // product instead of creating a second one (200, reEnabled: true).
  const reEnabled = product.$locals.reEnabled === true;
  res.status(reEnabled ? 200 : 201).json({
    success: true,
    message: reEnabled ? 'Product re-enabled.' : 'Product created.',
    reEnabled,
    ...warehouseProductViewModel.toProductResponse(product),
  });
});

const update = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  // Same rate rule as create, for a price that actually changes.
  const product = await warehouseProductService.updateProduct(
    req.params.id,
    warehouse._id,
    req.user._id,
    req.body,
    { requireRateUsed: true }
  );
  res.json({
    success: true,
    message: 'Product updated.',
    ...warehouseProductViewModel.toProductResponse(product),
  });
});

// The warehouse's override image for its own product (catalog overhaul Phase 9):
// uploaded to Cloudinary, never a typed URL. Clearing it is PATCH image:null.
const uploadImage = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const product = await warehouseProductService.setProductImage(req.params.id, warehouse._id, req.user._id, req.file);
  res.json({ success: true, message: 'Image updated.', ...warehouseProductViewModel.toProductResponse(product) });
});

const downloadTemplate = asyncHandler(async (req, res) => {
  const buffer = await productCatalogService.generateWarehouseTemplateBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="my-products-template.xlsx"');
  res.send(buffer);
});

// The upload. `mapping` (a multipart text field, JSON { headerKey: field }) is
// the column-mapping step's answer after a first upload came back
// IMPORT_COLUMNS_UNRECOGNIZED; it is remembered for this warehouse.
const importExcel = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const report = await warehouseProductService.importProductsFromExcel(warehouse._id, req.user._id, req.file, {
    mapping: typeof req.body?.mapping === 'string' ? req.body.mapping : null,
  });
  res.json({ success: true, ...report });
});

// The import results page: recent imports, one import's header, one tab of rows.
const listImports = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const { limit, after } = parseCursorQuery(req.query, 20);
  const { rows, hasMore, nextCursor } = await warehouseImportService.listImportBatches(warehouse._id, {
    limit,
    after: parseObjectIdCursor(after),
  });
  res.json({ success: true, imports: rows.map(importBatchViewModel.serializeBatch), pagination: paginationMeta(hasMore, nextCursor) });
});

const getImport = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const batch = await warehouseImportService.findOwnedBatchOrThrow(warehouse._id, req.params.batchId);
  res.json({ success: true, import: importBatchViewModel.serializeBatch(batch) });
});

const listImportRows = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const { limit, after } = parseCursorQuery(req.query, 50);
  const { rows, hasMore, nextCursor } = await warehouseImportService.listImportRows(warehouse._id, req.params.batchId, {
    bucket: req.query.bucket,
    limit,
    after: parseObjectIdCursor(after),
  });
  res.json({ success: true, rows: rows.map(importBatchViewModel.serializeRow), pagination: paginationMeta(hasMore, nextCursor) });
});

// Resolving a review row: onto a chosen catalog item (with any price / unit /
// bonus fix), or as a request for a new catalog item.
const resolveImportRow = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const { row, productId } = await warehouseImportService.resolveImportRow(
    warehouse._id,
    req.user._id,
    req.params.batchId,
    req.params.rowId,
    req.body || {}
  );
  res.json({ success: true, row: importBatchViewModel.serializeRow(row), productId });
});

const requestCatalogItem = asyncHandler(async (req, res) => {
  const warehouse = await loadWarehouseOrThrow(req.user._id);
  const request = await warehouseImportService.requestCatalogItemFromRow(
    warehouse._id,
    req.user._id,
    req.params.batchId,
    req.params.rowId,
    req.body || {}
  );
  res.status(201).json({ success: true, requestId: request._id });
});

module.exports = {
  list,
  search,
  create,
  update,
  uploadImage,
  downloadTemplate,
  importExcel,
  listImports,
  getImport,
  listImportRows,
  resolveImportRow,
  requestCatalogItem,
};
