const { ApiError } = require('../utils/ApiError');
const Product = require('../models/product.model');
const Offer = require('../models/offer.model');
const Manufacturer = require('../models/manufacturer.model');
const { normalizeText } = require('../utils/normalizeText');
const { isWarehouseAvailable } = require('./warehouse.service');
const { buildProductFilter, findProductPage } = require('./productCatalog.service');
const { getDiscountMapForWarehouse, discountPercentageFor } = require('./manufacturerDiscount.service');
const { activeOfferFilter, offerMapFor } = require('./offer.service');

// Everything the pharmacist-facing catalog actually consumes off a product
// row: product.viewmodel.js's serializeProductWithOffer needs categoryId /
// image / unitAr / unitEn / price / isAvailable plus the resolved identity
// (applyResolvedIdentity overwrites nameAr/nameEn/manufacturerAr/
// manufacturerEn from the linked catalog entry or the product's own legacy
// fields - both must be selectable). masterProductId is the populate key;
// manufacturerId (and, for legacy rows, manufacturerAr) is the discount-map
// key. Dropped: description, manuallyDisabled, lastPriceUpdate, the unbounded
// priceHistory array, warehouseId/isActive (the filter), timestamps.
const CATALOG_PRODUCT_SELECT =
  'categoryId nameAr nameEn manufacturerAr manufacturerEn manufacturerId manufacturerKey image unitAr unitEn unit bonuses price isAvailable masterProductId';

const DEFAULT_PRODUCTS_LIMIT = 20;

// Section 6.5: search by name and manufacturer, filterable by category.
// Section 7: an active, admin-approved offer on a product shows two prices
// (original struck-through + discounted) - merged in here per product.
//
// One Mongo query per page (catalog overhaul Phase 2): the filter - warehouse,
// active, and any of search / manufacturer / category - is built by the shared
// productCatalog.service.js's buildProductFilter and matched against the
// normalized keys every product carries. It used to resolve the search through
// the master list first (capped at 500 matches, so a broad term silently lost
// products - H2) and to filter the manufacturer in Node, batch after batch,
// until a page filled up (so a rare or unknown manufacturer scanned the whole
// warehouse - H1).
//
// `manufacturer` is optional: the pharmacist's warehouse-wide search sends only
// `search`. Cursor pagination on `_id` ascending, as before.
async function listWarehouseProducts(
  warehouseId,
  { search, categoryId, manufacturer, limit = DEFAULT_PRODUCTS_LIMIT, after = null } = {}
) {
  const available = await isWarehouseAvailable(warehouseId);
  if (!available) {
    throw ApiError.notFound('Warehouse not found.');
  }

  const filter = buildProductFilter({ warehouseId, search, manufacturer, categoryId });
  const { rows: products, hasMore, nextCursor } = await findProductPage(filter, {
    limit,
    after,
    direction: 1,
    select: CATALOG_PRODUCT_SELECT,
  });

  const now = new Date();
  const [offers, manufacturerDiscountByName] = await Promise.all([
    Offer.find({
      warehouseId,
      // The one "this offer is running right now" predicate, shared with the
      // pharmacist-facing offers listing (offer.service.js) so the catalog and
      // the Offers & Ads tab can never disagree about which offers are live. A
      // permanent offer has no endDate (isPermanent true, endDate null) and
      // stays live from its start date on.
      ...activeOfferFilter(now),
      productId: { $in: products.map((p) => p._id) },
    }).select('productId discountPercentage titleAr titleEn approvedAt'),
    getDiscountMapForWarehouse(warehouseId),
  ]);
  // The one deterministic "offer for this product" (offer.service.js) - never
  // last-one-wins over an unsorted query.
  const offerByProductId = offerMapFor(offers);

  // Section 15: the manufacturer discount (if any) stacks with an active
  // Offer - see product.viewmodel.js for where the two combine into one
  // discountPriceUsd.
  const items = products.map((product) => ({
    product,
    offer: offerByProductId.get(product._id.toString()) ?? null,
    manufacturerDiscountPercentage: discountPercentageFor(manufacturerDiscountByName, product),
  }));
  return { items, hasMore, nextCursor };
}

// The pharmacist's new entry point into a warehouse's catalog (warehouse ->
// manufacturers -> medicines, replacing the old warehouse -> medicines flow
// directly): distinct manufacturers derived live from this warehouse's own
// products, not the sticky warehouse_manufacturers registry
// (warehouseManufacturer.service.js) - that registry is for the warehouse's
// own Discounts dropdown and deliberately keeps manufacturers around after
// their products are gone, which would leave a pharmacist tapping into an
// empty catalog. isAvailable is NOT filtered here (only isActive, same base
// filter as listWarehouseProducts above) - a manufacturer stays listed even
// if every one of its medicines is temporarily unavailable, since that
// filtering happens at the medicine level once inside the catalog.
// The warehouse's manufacturers as entries - { manufacturerId, manufacturerAr,
// manufacturerEn, logoUrl } - resolved through the central Manufacturer
// (manufacturer.model.js) that every catalog-linked product carries a copy of
// (Product.manufacturerId). Two `distinct` queries and one lookup, so the work
// is proportional to the number of manufacturers, not to catalog size.
//
// A legacy product (no catalog link) whose free-text manufacturer matches no
// Manufacturer still lists under that text, with no id and no logo - exactly
// as it always did.
async function listManufacturerEntriesForWarehouse(warehouseId) {
  const [linkedIds, legacyNames] = await Promise.all([
    Product.distinct('manufacturerId', { warehouseId, isActive: true, manufacturerId: { $ne: null } }),
    Product.distinct('manufacturerAr', {
      warehouseId,
      isActive: true,
      masterProductId: null,
      manufacturerId: null,
    }),
  ]);

  const manufacturers = linkedIds.length
    ? await Manufacturer.find({ _id: { $in: linkedIds } }).select('nameAr nameEn logoUrl').lean()
    : [];

  const entries = manufacturers.map((m) => ({
    manufacturerId: m._id,
    manufacturerAr: m.nameAr,
    manufacturerEn: m.nameEn ?? null,
    logoUrl: m.logoUrl ?? null,
  }));
  const seenKeys = new Set(entries.map((entry) => normalizeText(entry.manufacturerAr)));
  for (const name of legacyNames) {
    const key = normalizeText(name);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    entries.push({ manufacturerId: null, manufacturerAr: name, manufacturerEn: null, logoUrl: null });
  }

  entries.sort((a, b) => a.manufacturerAr.localeCompare(b.manufacturerAr));
  return entries;
}

async function listDistinctManufacturersForWarehouse(warehouseId) {
  const available = await isWarehouseAvailable(warehouseId);
  if (!available) {
    throw ApiError.notFound('Warehouse not found.');
  }
  const entries = await listManufacturerEntriesForWarehouse(warehouseId);
  return entries.map((entry) => entry.manufacturerAr);
}

// Section 15 (pharmacist-facing): the same distinct list as above, each entry
// paired with the warehouse's standing manufacturer discount so the
// pharmacy's company cards can show it. Purely a read/serialisation join of
// two values that already exist - the discount map is the very one every
// catalog listing and order already builds (manufacturerDiscount.service.js),
// no price is computed here. A manufacturer with no discount rule reports 0,
// which the card shows as "0%" rather than hiding.
//
// `manufacturerId`, `manufacturerEn` and `logoUrl` are additions - installed
// app builds read only manufacturerAr/discountPercentage and ignore the rest.
// A null logoUrl means "draw the first letter in a coloured circle".
async function listManufacturersWithDiscountsForWarehouse(warehouseId) {
  const available = await isWarehouseAvailable(warehouseId);
  if (!available) {
    throw ApiError.notFound('Warehouse not found.');
  }
  const [entries, discountMap] = await Promise.all([
    listManufacturerEntriesForWarehouse(warehouseId),
    getDiscountMapForWarehouse(warehouseId),
  ]);
  return entries.map((entry) => ({
    manufacturerAr: entry.manufacturerAr,
    discountPercentage: discountPercentageFor(discountMap, entry) ?? 0,
    manufacturerId: entry.manufacturerId,
    manufacturerEn: entry.manufacturerEn,
    logoUrl: entry.logoUrl,
  }));
}

module.exports = {
  listWarehouseProducts,
  listDistinctManufacturersForWarehouse,
  listManufacturersWithDiscountsForWarehouse,
};
