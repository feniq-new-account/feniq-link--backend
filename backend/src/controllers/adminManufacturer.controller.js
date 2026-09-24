const { asyncHandler } = require('../utils/asyncHandler');
const manufacturerService = require('../services/manufacturer.service');
const { storeUploadedImage, releaseImage } = require('../services/imageAsset.service');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');
const { optionalString } = require('../services/productCatalog.service');

// The admin's Manufacturers screen (catalog overhaul §1.1b / Phase 5.4):
// names, logo, and merging two manufacturers into one.

function serializeManufacturer(m) {
  return {
    id: m._id,
    nameAr: m.nameAr,
    nameEn: m.nameEn ?? null,
    logoUrl: m.logoUrl ?? null,
    isActive: m.isActive !== false,
    catalogItemCount: m.catalogItemCount ?? undefined,
  };
}

const list = asyncHandler(async (req, res) => {
  const { limit, after } = parseCursorQuery(req.query, 30);
  const { items, hasMore, nextCursor } = await manufacturerService.listManufacturers({
    search: optionalString(req.query.search, 'search'),
    limit,
    after: parseObjectIdCursor(after),
  });
  res.json({ success: true, manufacturers: items.map(serializeManufacturer), pagination: paginationMeta(hasMore, nextCursor) });
});

const update = asyncHandler(async (req, res) => {
  const manufacturer = await manufacturerService.updateManufacturer(req.params.id, req.body || {});
  res.json({ success: true, manufacturer: serializeManufacturer(manufacturer) });
});

// `sourceId` is folded into the manufacturer in the URL.
const merge = asyncHandler(async (req, res) => {
  const { manufacturer, mergedCatalogPairs, discountClashes } = await manufacturerService.mergeManufacturers(
    req.params.id,
    req.body?.sourceId
  );
  res.json({ success: true, manufacturer: serializeManufacturer(manufacturer), mergedCatalogPairs, discountClashes });
});

const uploadLogo = asyncHandler(async (req, res) => {
  await manufacturerService.findManufacturerOrThrow(req.params.id);
  const url = await storeUploadedImage(req.file, 'manufacturers');
  const { manufacturer, previousLogoUrl } = await manufacturerService.setManufacturerLogo(req.params.id, url);
  await releaseImage(previousLogoUrl);
  res.json({ success: true, manufacturer: serializeManufacturer(manufacturer) });
});

const clearLogo = asyncHandler(async (req, res) => {
  const { manufacturer, previousLogoUrl } = await manufacturerService.setManufacturerLogo(req.params.id, null);
  await releaseImage(previousLogoUrl);
  res.json({ success: true, manufacturer: serializeManufacturer(manufacturer) });
});

module.exports = { list, update, merge, uploadLogo, clearLogo };
