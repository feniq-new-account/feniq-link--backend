const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const Product = require('../models/product.model');
const Warehouse = require('../models/warehouse.model');
const { applyProductUpdate } = require('./warehouseProduct.service');
const {
  applyResolvedIdentity,
  buildProductFilter,
  findProductPage,
  optionalString,
} = require('./productCatalog.service');

// Section 13c: the admin's oversight view spans every warehouse - unlike the
// warehouse's own list, this deliberately does NOT filter isActive, so a
// deactivated product still shows up (with a visible status) as a record of
// what was removed, not just active inventory to manage.
//
// Section 14 Part 2: identity resolution only happens here, in a read-only
// listing - never in findAnyProductOrThrow below, whose result goes on to
// `.save()` in updateProduct. Resolving there would silently copy the
// catalog's name back onto the product's own (legacy) fields on every edit,
// exactly the duplication Section 14 says not to do.
// adminProduct.viewmodel.js reads only the two warehouse names off the joined
// warehouse; the populated catalog entry is only used for identity resolution
// (its four name/manufacturer fields).
const ADMIN_PRODUCT_WAREHOUSE_SELECT = 'nameAr nameEn';
const CATALOG_IDENTITY_SELECT = 'nameAr nameEn manufacturerAr manufacturerEn';

async function listAllProducts() {
  const products = await Product.find({})
    .populate({ path: 'masterProductId', select: CATALOG_IDENTITY_SELECT });
  products.forEach(applyResolvedIdentity);
  products.sort((a, b) => (a.nameEn || a.nameAr || '').localeCompare(b.nameEn || b.nameAr || ''));
  if (products.length === 0) return [];

  const warehouseIds = [...new Set(products.map((p) => p.warehouseId.toString()))];
  const warehouses = await Warehouse.find({ _id: { $in: warehouseIds } }).select(ADMIN_PRODUCT_WAREHOUSE_SELECT);
  const warehouseById = new Map(warehouses.map((w) => [w._id.toString(), w]));

  return products.map((product) => ({
    product,
    warehouse: warehouseById.get(product.warehouseId.toString()) ?? null,
  }));
}

const ADMIN_PRODUCTS_DEFAULT_LIMIT = 30;

// The Products management page (unlike listAllProducts above - still used
// as-is by the Dashboard's count and the Banners composer's product picker,
// both needing every product) wants "Load more" plus warehouse/category/
// manufacturer/search filters sent to the server. Cursor pagination on `_id`
// ascending.
//
// The shared product search (productCatalog.service.js's buildProductFilter)
// with warehouseId optional - the one caller that searches across every
// warehouse. It stays bounded: one page per request, capped at 100 by
// parseCursorQuery, never the unbounded id list it used to build. Deactivated
// products are included (activeOnly: false) - this is the admin's record of
// what was removed, shown with a visible status.
async function listPaginatedAllProducts({
  search,
  warehouseId,
  categoryId,
  manufacturer,
  limit = ADMIN_PRODUCTS_DEFAULT_LIMIT,
  after = null,
} = {}) {
  const warehouse = optionalString(warehouseId, 'warehouse');
  if (warehouse && !mongoose.Types.ObjectId.isValid(warehouse)) {
    throw ApiError.badRequest('Invalid warehouse id.', undefined, 'INVALID_WAREHOUSE');
  }
  const filter = buildProductFilter({
    warehouseId: warehouse,
    activeOnly: false,
    search,
    manufacturer,
    categoryId,
  });
  const { rows: page, hasMore, nextCursor } = await findProductPage(filter, {
    limit,
    after,
    direction: 1,
    select: '-priceHistory',
  });

  if (page.length === 0) return { rows: [], hasMore: false, nextCursor: null };

  const warehouseIds = [...new Set(page.map((p) => p.warehouseId.toString()))];
  const warehouses = await Warehouse.find({ _id: { $in: warehouseIds } })
    .select(ADMIN_PRODUCT_WAREHOUSE_SELECT)
    .lean();
  const warehouseById = new Map(warehouses.map((w) => [w._id.toString(), w]));

  const rows = page.map((product) => ({
    product,
    warehouse: warehouseById.get(product.warehouseId.toString()) ?? null,
  }));

  return { rows, hasMore, nextCursor };
}

// The Dashboard's "products" stat card, and nothing else. It used to call
// listAllProducts() and read `.length` off it - every product on the
// platform loaded, hydrated, identity-resolved, locale-sorted and serialised
// to JSON so one integer could be rendered. countDocuments does it in the
// database, and the Dashboard re-runs this on every realtime event
// (useRealtimeSync), so the difference is per-event, not per-page-load.
//
// Counts every product, active or not - same set listAllProducts returned,
// so the number on the card doesn't change meaning with this switch.
async function countAllProducts() {
  return Product.countDocuments({});
}

// Distinct warehouses that currently have at least one product - backs the
// management page's warehouse filter dropdown. Fetched independently of the
// paginated rows above (a product's own page won't necessarily include
// every warehouse), and independently of listAllProducts's full fetch too.
async function listWarehousesWithProducts() {
  const warehouseIds = await Product.distinct('warehouseId');
  const warehouses = await Warehouse.find({ _id: { $in: warehouseIds } }).select('nameEn').sort({ nameEn: 1 });
  return warehouses.map((w) => ({ id: w._id, nameEn: w.nameEn }));
}

async function findAnyProductOrThrow(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw ApiError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
  }
  const product = await Product.findById(productId);
  if (!product) {
    throw ApiError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
  }
  return product;
}

// Section 13c: admin can edit any warehouse's product - same validation and
// price-history/isAvailable rules as the warehouse's own edit
// (warehouseProduct.service.js), just without the ownership scoping.
// That includes the exchange-rate check on a new price (`options`).
async function updateProduct(productId, userId, changes, options) {
  const product = await findAnyProductOrThrow(productId);
  return applyProductUpdate(product, userId, changes, options);
}

// Section 13c: admin can deactivate (not hard-delete) any product - the
// pharmacist-facing catalog and the warehouse's own list both already filter
// isActive, so this is immediately invisible on both sides. Idempotent: no
// error if it's already inactive, since there's no meaningful "undo" state
// to protect here (no reactivate flow exists yet).
//
// Recorded as deactivatedBy 'admin' - also over an earlier 'catalog_recall',
// since the admin's explicit decision must survive the catalog item being
// reactivated later (which only brings back 'catalog_recall' products).
async function deactivateProduct(productId) {
  const product = await findAnyProductOrThrow(productId);
  product.isActive = false;
  product.deactivatedBy = 'admin';
  await product.save();
  return product;
}

module.exports = {
  listAllProducts,
  listPaginatedAllProducts,
  countAllProducts,
  listWarehousesWithProducts,
  updateProduct,
  deactivateProduct,
};
