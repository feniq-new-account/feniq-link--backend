const { asyncHandler } = require('../utils/asyncHandler');
const { ApiError } = require('../utils/ApiError');
const catalogService = require('../services/productCatalog.service');
const catalogViewModel = require('../viewmodels/productCatalog.viewmodel');
const catalogRequestService = require('../services/catalogRequest.service');
const catalogRequestViewModel = require('../viewmodels/catalogRequest.viewmodel');
const catalogMergeService = require('../services/catalogMerge.service');
const { storeUploadedImage, releaseImage } = require('../services/imageAsset.service');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

const CATALOG_DEFAULT_LIMIT = 30;

const list = asyncHandler(async (req, res) => {
  const { limit, after } = parseCursorQuery(req.query, CATALOG_DEFAULT_LIMIT);
  const cursor = parseObjectIdCursor(after);

  const { items, hasMore, nextCursor } = await catalogService.listCatalog({
    // Unified on `search` (was `q`) to match GET /admin/products and
    // GET /admin/accounts, rather than being the odd one out.
    search: req.query.search,
    categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
    manufacturer: typeof req.query.manufacturer === 'string' ? req.query.manufacturer : undefined,
    limit,
    after: cursor,
  });
  res.json({
    success: true,
    ...catalogViewModel.toCatalogListResponse(items),
    pagination: paginationMeta(hasMore, nextCursor),
  });
});

const searchManufacturers = asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const manufacturers = await catalogService.searchManufacturers(search);
  res.json({ success: true, manufacturers });
});

const downloadTemplate = asyncHandler(async (req, res) => {
  const buffer = await catalogService.generateTemplateBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="product-catalog-template.xlsx"');
  res.send(buffer);
});

// Multipart text fields, each JSON: `confirmNewManufacturers` (names from a
// previous report's newManufacturers to create), `manufacturerLinks`
// ({ rawName: manufacturerId } to file them under an existing one) and
// `mapping` ({ headerKey: field }, the column-mapping step). A malformed one is
// a 400, never silently ignored.
function jsonField(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw ApiError.badRequest(`Invalid ${name}.`, undefined, 'INVALID_QUERY_PARAM');
  }
}

const importExcel = asyncHandler(async (req, res) => {
  const confirmNewManufacturers = jsonField(req.body?.confirmNewManufacturers, 'confirmNewManufacturers') ?? [];
  const manufacturerLinks = jsonField(req.body?.manufacturerLinks, 'manufacturerLinks') ?? {};
  const mapping = jsonField(req.body?.mapping, 'mapping');
  if (!Array.isArray(confirmNewManufacturers) || typeof manufacturerLinks !== 'object' || Array.isArray(manufacturerLinks)) {
    throw ApiError.badRequest('Invalid manufacturer confirmation.', undefined, 'INVALID_QUERY_PARAM');
  }
  const report = await catalogService.importFromExcel(req.file, {
    confirmNewManufacturers,
    manufacturerLinks,
    mapping,
  });
  res.json({ success: true, ...report });
});

// `confirm=true` acknowledges the CATALOG_RENAME_NEEDS_CONFIRMATION the
// first attempt returns - a query param rather than a body field so the
// retry is the identical PATCH body, just re-sent.
const update = asyncHandler(async (req, res) => {
  const item = await catalogService.updateCatalogItem(req.params.id, req.body, {
    userId: req.user._id,
    confirmed: req.query.confirm === 'true',
  });
  // restoredProductCount: how many recalled products came back when this PATCH
  // re-enabled the item (0 otherwise) - so the panel can say so.
  res.json({
    success: true,
    ...catalogViewModel.toCatalogItemResponse(item),
    restoredProductCount: item.restoredProductCount ?? 0,
  });
});

// Reports how many warehouse products went with it - deactivating a master
// entry now cascades to every product linked to it, and that is a large
// enough consequence that the panel should be able to say so rather than
// leave the admin to discover it.
// The recall also stops the offers on those products and takes them out of any
// package - the counts let the panel spell the whole consequence out.
const deactivate = asyncHandler(async (req, res) => {
  const { deactivatedProductCount, stoppedOfferCount, affectedPackageCount, emptiedPackageCount } =
    await catalogService.deactivateCatalogItem(req.params.id);
  res.json({
    success: true,
    message: 'Catalog item deactivated.',
    deactivatedProductCount,
    stoppedOfferCount,
    affectedPackageCount,
    emptiedPackageCount,
  });
});

// ---------------------------------------------------------------------------
// Catalog requests (catalog overhaul Phase 5.1)
// ---------------------------------------------------------------------------

const listRequests = asyncHandler(async (req, res) => {
  const { limit, after } = parseCursorQuery(req.query, 30);
  const status = catalogService.optionalString(req.query.status, 'status') ?? 'pending';
  const { rows, hasMore, nextCursor } = await catalogRequestService.listRequests({
    status: status === 'all' ? undefined : status,
    limit,
    after: parseObjectIdCursor(after),
  });
  res.json({
    success: true,
    requests: rows.map(catalogRequestViewModel.serializeCatalogRequest),
    pagination: paginationMeta(hasMore, nextCursor),
  });
});

const approveRequest = asyncHandler(async (req, res) => {
  const request = await catalogRequestService.approveRequest(req.params.id, req.user._id, req.body || {});
  res.json({ success: true, request: catalogRequestViewModel.serializeCatalogRequest({ request, warehouse: null }) });
});

const mergeRequest = asyncHandler(async (req, res) => {
  const request = await catalogRequestService.mergeRequest(req.params.id, req.user._id, req.body || {});
  res.json({ success: true, request: catalogRequestViewModel.serializeCatalogRequest({ request, warehouse: null }) });
});

const rejectRequest = asyncHandler(async (req, res) => {
  const request = await catalogRequestService.rejectRequest(req.params.id, req.user._id, req.body || {});
  res.json({ success: true, request: catalogRequestViewModel.serializeCatalogRequest({ request, warehouse: null }) });
});

// ---------------------------------------------------------------------------
// Duplicate review (Phase 5.2)
// ---------------------------------------------------------------------------

const listDuplicates = asyncHandler(async (req, res) => {
  const { limit, after } = parseCursorQuery(req.query, 20);
  const { rows, hasMore, nextCursor } = await catalogMergeService.listDuplicateReviews({
    limit,
    after: parseObjectIdCursor(after),
  });
  res.json({ success: true, groups: rows, pagination: paginationMeta(hasMore, nextCursor) });
});

// Body: { survivorId, keepProductByWarehouse: { [warehouseId]: productId } }.
const resolveDuplicate = asyncHandler(async (req, res) => {
  const result = await catalogMergeService.resolveDuplicateReview(req.params.id, req.user._id, req.body || {});
  res.json({ success: true, ...result });
});

// ---------------------------------------------------------------------------
// The central image (Phase 5.3)
// ---------------------------------------------------------------------------

const uploadImage = asyncHandler(async (req, res) => {
  await catalogService.findCatalogItemOrThrow(req.params.id);
  const url = await storeUploadedImage(req.file, 'catalog');
  const { item, previousImageUrl } = await catalogService.setCatalogImage(req.params.id, url);
  await releaseImage(previousImageUrl);
  res.json({ success: true, ...catalogViewModel.toCatalogItemResponse(item) });
});

const clearImage = asyncHandler(async (req, res) => {
  const { item, previousImageUrl } = await catalogService.setCatalogImage(req.params.id, null);
  await releaseImage(previousImageUrl);
  res.json({ success: true, ...catalogViewModel.toCatalogItemResponse(item) });
});

module.exports = {
  list,
  searchManufacturers,
  downloadTemplate,
  importExcel,
  update,
  deactivate,
  listRequests,
  approveRequest,
  mergeRequest,
  rejectRequest,
  listDuplicates,
  resolveDuplicate,
  uploadImage,
  clearImage,
};
