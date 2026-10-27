const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const ProductCatalog = require('../models/productCatalog.model');
const { applyResolvedIdentity, buildProductFilter, findProductPage } = require('./productCatalog.service');
const { importWarehouseFile } = require('./warehouseImport.service');
const { assertRateUsedIsCurrent } = require('./exchangeRate.service');
const { runInTransaction } = require('../utils/transaction');
const { UNIT_CODES, unitNameAr, unitNameEn } = require('../config/units');
const { normalizeBonusTiers } = require('../utils/bonus');
const { imageUrlInput, storeUploadedImage, releaseImage } = require('./imageAsset.service');

const WAREHOUSE_PRODUCTS_DEFAULT_LIMIT = 20;

// The list responses drop priceHistory (warehouseProduct.viewmodel.js), so
// there is no reason for the array to leave the database on these paths at
// all - an exclusion rather than an inclusion list, since it's the one field
// being removed and every other one is either serialised or part of the
// filter. findOwnedProductOrThrow deliberately does NOT use this: the update
// path has to read the array to append to it.
const LIST_PRODUCT_SELECT = '-priceHistory';

// How many price changes a product keeps. The array used to grow without
// limit, one entry per edit and one per re-import, and was serialised in full
// by every list response - a warehouse re-importing its price list weekly
// accumulated hundreds of entries per product. The most recent ones are the
// only ones anything actually shows, so older entries are dropped as new ones
// arrive ($slice on the $push).
const PRICE_HISTORY_LIMIT = 50;

// Section 14 Part 2: name/manufacturer no longer come from the warehouse -
// they're resolved from the linked catalog entry (masterProductId),
// validated separately below. Only unit stays a manually-typed field on the
// create form.
const REQUIRED_STRING_FIELDS = [
  ['unitAr', 'INVALID_UNIT'],
  ['unitEn', 'INVALID_UNIT'],
];

// Section 8: isAvailable is never set directly - it's always derived from
// this, recomputed on every create/update.
// TODO(re-enable-stock): was also gated on stockQuantity > 0 - see the TODO
// on product.model.js. Restore that AND-condition when stock tracking returns.
function computeIsAvailable(manuallyDisabled) {
  return !manuallyDisabled;
}

async function validateCategoryId(categoryId) {
  if (typeof categoryId !== 'string' || !mongoose.Types.ObjectId.isValid(categoryId)) {
    throw ApiError.badRequest('Invalid category.', undefined, 'INVALID_CATEGORY');
  }
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) {
    throw ApiError.badRequest('Invalid category.', undefined, 'INVALID_CATEGORY');
  }
}

// Section 14 Part 2: every new product must link to an active central-
// catalog entry. A malformed or unknown id is a 400; an item that exists but
// has been withdrawn (recalled) gets its own code, so the warehouse is told
// why rather than "invalid".
async function validateMasterProductId(masterProductId) {
  if (typeof masterProductId !== 'string' || !mongoose.Types.ObjectId.isValid(masterProductId)) {
    throw ApiError.badRequest('Invalid catalog item.', undefined, 'INVALID_MASTER_PRODUCT');
  }
  const catalogItem = await ProductCatalog.findById(masterProductId).select('isActive').lean();
  if (!catalogItem) {
    throw ApiError.badRequest('Invalid catalog item.', undefined, 'INVALID_MASTER_PRODUCT');
  }
  if (catalogItem.isActive === false) throw withdrawnError();
  return catalogItem;
}

function withdrawnError() {
  return ApiError.conflict(
    'This medicine has been withdrawn from the central catalog.',
    'CATALOG_ITEM_WITHDRAWN'
  );
}

function disabledByAdminError() {
  return ApiError.conflict('This product has been disabled by the administration.', 'PRODUCT_DISABLED_BY_ADMIN');
}

// Why an existing product of this warehouse cannot be touched by an add or an
// import (catalog overhaul Phase 3.4): the platform switched it off. Its
// catalog item was withdrawn (recall), or an admin disabled it individually.
// Null when the warehouse may update it. Rows written before deactivatedBy
// existed (null) count as admin-disabled - 03-deactivated-by.js fills them in.
function blockedCodeFor(product) {
  if (!product || product.isActive !== false) return null;
  return product.deactivatedBy === 'catalog_recall' ? 'CATALOG_ITEM_WITHDRAWN' : 'PRODUCT_DISABLED_BY_ADMIN';
}

function throwIfBlocked(product) {
  const code = blockedCodeFor(product);
  if (code === 'CATALOG_ITEM_WITHDRAWN') throw withdrawnError();
  if (code === 'PRODUCT_DISABLED_BY_ADMIN') throw disabledByAdminError();
}

// Inside a create/link transaction: confirms the catalog item is still active
// AND writes to it (lastLinkedAt), so a recall of the same item running at
// the same moment conflicts with this transaction - one of the two retries
// and sees the other's result (M5). A plain read would not conflict.
async function claimActiveCatalogItem(masterProductId, session) {
  const result = await ProductCatalog.updateOne(
    { _id: masterProductId, isActive: true },
    { $set: { lastLinkedAt: new Date() } },
    { session }
  );
  if (result.matchedCount === 0) throw withdrawnError();
}


// `price` on the Product doc is USD (Section: USD-first catalog pricing) -
// kept as the Mongoose field name to avoid a schema migration, but every
// request/response boundary spells it out as `priceUsd` so it's never
// mistaken for the old SYP-denominated value. See
// backend/scripts/migrate-prices-to-usd.js for the one-time conversion of
// pre-existing data, and order.service.js for how SYP is derived from this
// at order time.
function validatePrice(priceUsd) {
  if (typeof priceUsd !== 'number' || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw ApiError.badRequest('Invalid price.', undefined, 'INVALID_PRICE');
  }
}

function validateRequiredStrings(data) {
  // A unit code (the form's dropdown, config/units.js) stands in for the two
  // free-text unit fields; a client that still sends only unitAr/unitEn keeps
  // working.
  if (data.unit !== undefined && data.unit !== null) return;
  for (const [field, code] of REQUIRED_STRING_FIELDS) {
    if (typeof data[field] !== 'string' || !data[field].trim()) {
      throw ApiError.badRequest(`Invalid ${field}.`, undefined, code);
    }
  }
}

// The unit fields to write for a unit input: a code from the fixed list
// (catalog overhaul §4.5) also fills the legacy unitAr/unitEn with its labels,
// so installed app builds that only read those keep showing a unit. Returns
// undefined when no unit was sent at all.
function unitFieldsFrom(data) {
  if (data.unit !== undefined && data.unit !== null) {
    if (!UNIT_CODES.includes(data.unit)) {
      throw ApiError.badRequest('Invalid unit.', undefined, 'INVALID_UNIT');
    }
    return { unit: data.unit, unitAr: unitNameAr(data.unit), unitEn: unitNameEn(data.unit) };
  }
  if (typeof data.unitAr === 'string' && typeof data.unitEn === 'string') {
    return { unitAr: data.unitAr.trim(), unitEn: data.unitEn.trim() };
  }
  return undefined;
}

// productionDate / expiryDate from the form: a date string, or null / '' to
// clear; undefined when not sent.
function dateFrom(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw ApiError.badRequest(`Invalid ${field}.`, undefined, 'INVALID_DATE');
  }
  return date;
}

function batchDatesFrom(data) {
  const dates = {};
  for (const field of ['productionDate', 'expiryDate']) {
    const date = dateFrom(data[field], field);
    if (date !== undefined) dates[field] = date;
  }
  return dates;
}

// Bonus tiers from the form - an array of { buy, free } or the text form
// ("10+1، 20+3"); undefined when not sent, [] to clear (utils/bonus.js).
function bonusesFrom(data) {
  const input = data.bonuses !== undefined ? data.bonuses : data.bonus;
  const parsed = normalizeBonusTiers(input);
  if (!parsed.ok) throw ApiError.badRequest('Invalid bonus.', undefined, 'INVALID_BONUS');
  return parsed.tiers;
}

// isActive: true - a product an admin has deactivated (adminProduct.service.js)
// is gone from the warehouse's own catalog too, not just the pharmacist-facing
// one; there's no reactivate flow yet, so from the warehouse's side it's simply
// no longer there.
// The warehouse's own product list, newest first with "Load more" - the only
// shape there is (catalog overhaul Phase 10 removed the unpaginated one the
// pickers used). An ObjectId's embedded timestamp makes `_id` descending
// equivalent to `createdAt` descending, so no compound cursor is needed.
//
// `manufacturerAr` narrows the page to one company (the catalog page opens on
// a company list and drills into it) - an EXACT company match on its
// normalized key, through the shared product search
// (productCatalog.service.js's buildProductFilter), so "Load more" keeps
// paging through that company's products only.
async function listPaginatedProductsForWarehouse(
  warehouseId,
  { limit = WAREHOUSE_PRODUCTS_DEFAULT_LIMIT, after = null, manufacturerAr = null, availableOnly = false } = {}
) {
  const filter = buildProductFilter({ warehouseId, manufacturer: manufacturerAr ?? undefined, availableOnly });
  return findProductPage(filter, { limit, after, direction: -1, select: LIST_PRODUCT_SELECT });
}

// Backs the advertisement product picker: search this warehouse's own
// products by name (or manufacturer), paginated - so the panel never has to
// pull the whole catalog down and filter it client-side. Same shared search as
// every other product search (normalized keys, one query per page).
//
// A blank `q` is not an error - it just yields the same newest-first page
// listPaginatedProductsForWarehouse gives, so the picker can show something
// before anything is typed.
async function searchPaginatedProductsForWarehouse(
  warehouseId,
  { q = '', limit = WAREHOUSE_PRODUCTS_DEFAULT_LIMIT, after = null, availableOnly = false } = {}
) {
  const filter = buildProductFilter({ warehouseId, search: q ?? undefined, availableOnly });
  return findProductPage(filter, { limit, after, direction: -1, select: LIST_PRODUCT_SELECT });
}

// Section 8/14 Part 2: every field a warehouse can set at creation.
// name/manufacturer are no longer among them - masterProductId (chosen via
// catalog search, see warehouseCatalog.routes.js) is what identifies the
// product now.
//
// `priceUsd` is converted from the SYP the warehouse typed, so the request
// must say at which rate (`rateUsed`) and that rate must still be the current
// one - see exchangeRate.service.js's assertRateUsedIsCurrent.
// `requireRateUsed` is set by the HTTP controller; a direct caller that sends
// no rate is not checked.
//
// Adding a medicine this warehouse already has (catalog overhaul Phase 3.4):
//  - it disabled that product itself (manuallyDisabled) or hid it from its
//    catalog (hiddenByWarehouse) -> the product is re-enabled (and shown
//    again) with the new price and fields, and returned as such;
//  - the platform disabled it (recall / admin) -> refused with
//    CATALOG_ITEM_WITHDRAWN / PRODUCT_DISABLED_BY_ADMIN, nothing changes;
//  - it is live -> PRODUCT_ALREADY_LINKED, as before.
// All in one transaction that also re-checks the catalog item is still active.
async function createProduct(warehouseId, data, { requireRateUsed = false, userId = null } = {}) {
  validateRequiredStrings(data);
  await validateMasterProductId(data.masterProductId);
  await validateCategoryId(data.categoryId);
  validatePrice(data.priceUsd);
  unitFieldsFrom(data);
  bonusesFrom(data);
  batchDatesFrom(data);
  imageUrlInput(data.image);
  await assertRateUsedIsCurrent(data.rateUsed, { required: requireRateUsed });

  const manuallyDisabled = data.manuallyDisabled === true;
  const hiddenByWarehouse = data.hiddenByWarehouse === true;

  let product;
  let reEnabled = false;
  try {
    await runInTransaction(async (session) => {
      reEnabled = false;
      await claimActiveCatalogItem(data.masterProductId, session);

      const existing = await Product.findOne({ warehouseId, masterProductId: data.masterProductId }).session(session);
      if (existing) {
        throwIfBlocked(existing);
        if (!existing.manuallyDisabled && !existing.hiddenByWarehouse) {
          throw ApiError.conflict('You already have a product linked to this medicine.', 'PRODUCT_ALREADY_LINKED');
        }
        product = await applyProductUpdate(
          existing,
          userId,
          {
            categoryId: data.categoryId,
            unit: data.unit,
            unitAr: data.unitAr,
            unitEn: data.unitEn,
            bonuses: data.bonuses !== undefined ? data.bonuses : data.bonus,
            description: data.description,
            image: data.image,
            priceUsd: data.priceUsd,
            productionDate: data.productionDate,
            expiryDate: data.expiryDate,
            manuallyDisabled,
            hiddenByWarehouse,
          },
          { session, resolve: false }
        );
        reEnabled = true;
        return;
      }

      [product] = await Product.create(
        [
          {
            warehouseId,
            masterProductId: data.masterProductId,
            categoryId: data.categoryId,
            ...unitFieldsFrom(data),
            bonuses: bonusesFrom(data) ?? [],
            ...batchDatesFrom(data),
            description:
              typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null,
            image: imageUrlInput(data.image) ?? null,
            price: data.priceUsd,
            manuallyDisabled,
            isAvailable: computeIsAvailable(manuallyDisabled),
            hiddenByWarehouse,
            lastPriceUpdate: new Date(),
          },
        ],
        { session }
      );
    });
  } catch (err) {
    // The (warehouseId, masterProductId) unique index (product.model.js) - two
    // adds of the same medicine racing each other. A raw Mongo E11000 error
    // would otherwise leak internal index/field names straight to the client.
    if (err.code === 11000) {
      throw ApiError.conflict('You already have a product linked to this medicine.', 'PRODUCT_ALREADY_LINKED');
    }
    throw err;
  }

  // Resolved strictly *after* the write, purely so the response reflects the
  // linked catalog's name - this in-memory-only doc is never saved again
  // within this request, so it can't leak back into storage.
  await releaseReplacedImage(product);
  await product.populate('masterProductId');
  applyResolvedIdentity(product);
  product.$locals.reEnabled = reEnabled;
  return product;
}

// IDOR guard: scoped to warehouseId, same pattern as every other
// warehouse-owned resource in this codebase.
async function findOwnedProductOrThrow(productId, warehouseId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw ApiError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
  }
  const product = await Product.findOne({ _id: productId, warehouseId, isActive: true });
  if (!product) {
    throw ApiError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
  }
  return product;
}

// Section 7/13c: every price change is recorded (old/new/who/when) -
// manuallyDisabled changes recompute isAvailable, never written directly.
// All fields are optional here (partial update) but validated if present.
// Shared by the warehouse's own update (below) and the admin's
// (adminProduct.service.js) - only how the target product is found differs
// (owned-by-me vs any product), not what happens to it once found.
//
// A NEW price was converted from SYP at the panel's rate, so it carries
// `rateUsed` and is refused if that rate is no longer current (same rule as
// createProduct). Re-sending the stored price unchanged depends on no rate and
// needs none - the panel does exactly that for an untouched price field.
//
// Concurrency (M5): the product schema has optimisticConcurrency, so this
// save only lands if nobody else saved the product since it was loaded. An
// admin edit and a warehouse edit racing each other therefore can't silently
// overwrite one another (or record a priceHistory `oldPrice` that was already
// stale) - the loser gets 409 PRODUCT_CHANGED and re-reads.
//
// `session` runs the save inside the caller's transaction (createProduct's
// re-enable path); `resolve: false` skips the response-only identity
// resolution when the caller does its own.
async function applyProductUpdate(
  product,
  userId,
  changes,
  { requireRateUsed = false, session = null, resolve = true, trustedImageUpload = false } = {}
) {
  if (changes.unit !== undefined && changes.unit !== null) {
    Object.assign(product, unitFieldsFrom(changes));
  } else {
    for (const [field, code] of REQUIRED_STRING_FIELDS) {
      if (changes[field] !== undefined) {
        if (typeof changes[field] !== 'string' || !changes[field].trim()) {
          throw ApiError.badRequest(`Invalid ${field}.`, undefined, code);
        }
        product[field] = changes[field].trim();
      }
    }
  }

  const bonuses = bonusesFrom(changes);
  if (bonuses !== undefined) {
    product.bonuses = bonuses;
  }

  Object.assign(product, batchDatesFrom(changes));

  if (changes.categoryId !== undefined) {
    await validateCategoryId(changes.categoryId);
    product.categoryId = changes.categoryId;
  }

  if (changes.description !== undefined) {
    product.description = typeof changes.description === 'string' && changes.description.trim()
      ? changes.description.trim()
      : null;
  }

  // Phase 9 (M7): only an image we uploaded (imageUrlInput, 400
  // INVALID_IMAGE_URL otherwise); null or '' clears the override (L3). The
  // replaced one is released once the write is durable (releaseReplacedImage).
  const image = imageUrlInput(changes.image, { currentUrl: product.image, trustedUpload: trustedImageUpload });
  if (image !== undefined && image !== product.image) {
    product.$locals.replacedImage = product.image ?? null;
    product.image = image;
  }

  if (changes.priceUsd !== undefined) {
    validatePrice(changes.priceUsd);
    if (changes.priceUsd !== product.price) {
      // Before the history entry or anything else lands - a refusal here
      // leaves the document unsaved.
      await assertRateUsedIsCurrent(changes.rateUsed, { required: requireRateUsed });
      product.priceHistory.push({
        oldPrice: product.price,
        newPrice: changes.priceUsd,
        changedBy: userId,
        changedAt: new Date(),
      });
      // Same cap the import path applies via $slice - kept here in JS because
      // this path goes through .save() on a hydrated document rather than a
      // bulkWrite. Oldest entries go first; the tail is what anything reads.
      if (product.priceHistory.length > PRICE_HISTORY_LIMIT) {
        product.priceHistory = product.priceHistory.slice(-PRICE_HISTORY_LIMIT);
      }
      product.price = changes.priceUsd;
      product.lastPriceUpdate = new Date();
    }
  }

  if (changes.manuallyDisabled !== undefined) {
    product.manuallyDisabled = changes.manuallyDisabled === true;
  }

  // Off the pharmacists' catalog altogether, or back on it.
  if (changes.hiddenByWarehouse !== undefined) {
    product.hiddenByWarehouse = changes.hiddenByWarehouse === true;
  }

  product.isAvailable = computeIsAvailable(product.manuallyDisabled);

  try {
    await product.save({ session });
  } catch (err) {
    if (err.name === 'VersionError') {
      throw ApiError.conflict(
        'This product was changed by someone else in the meantime. Reload it and try again.',
        'PRODUCT_CHANGED'
      );
    }
    throw err;
  }
  // Outside a transaction the save above is final; inside one the caller
  // releases after the commit (createProduct).
  if (!session) await releaseReplacedImage(product);
  if (!resolve) return product;

  // Same "resolve only after the write is durable" reasoning as
  // createProduct above - this response-only mutation never gets saved.
  await product.populate('masterProductId');
  return applyResolvedIdentity(product);
}

// Deletes the image an update replaced or cleared - only if it is ours and
// nothing else points at it (imageAsset.service.js). Best effort.
async function releaseReplacedImage(product) {
  const replaced = product.$locals.replacedImage;
  if (!replaced) return;
  product.$locals.replacedImage = null;
  await releaseImage(replaced);
}

// Uploads the warehouse's override image for its own product (Phase 9) and
// releases the one it replaces.
async function setProductImage(productId, warehouseId, userId, file) {
  const product = await findOwnedProductOrThrow(productId, warehouseId);
  const url = await storeUploadedImage(file, 'products');
  try {
    return await applyProductUpdate(product, userId, { image: url }, { trustedImageUpload: true });
  } catch (err) {
    await releaseImage(url);
    throw err;
  }
}

async function updateProduct(productId, warehouseId, userId, changes, options) {
  const product = await findOwnedProductOrThrow(productId, warehouseId);
  return applyProductUpdate(product, userId, changes, options);
}

// Section 14 Part 2 / catalog overhaul Phase 4: the warehouse's Excel import.
// The whole flow - reading any reasonable price list, matching rows to the
// central catalog (remembered aliases first), the added / updated / price-0 /
// blocked / review / error outcomes, and the ImportBatch the results page
// opens - lives in warehouseImport.service.js; this stays the entry point the
// controller has always called. `mapping` is the web's column-mapping answer
// ({ headerKey: field }), sent when the first upload came back
// IMPORT_COLUMNS_UNRECOGNIZED.
async function importProductsFromExcel(warehouseId, userId, file, { mapping = null } = {}) {
  const { batch, counts, exchangeRateUsed, convertedFromSyp } = await importWarehouseFile(warehouseId, userId, file, {
    mapping,
  });
  return {
    batchId: batch._id,
    counts,
    exchangeRateUsed,
    convertedFromSyp,
    // The old report fields, for a panel that predates the results page.
    added: counts.added + counts.addedDisabled,
    updated: counts.updated,
    errors: [],
  };
}

module.exports = {
  listPaginatedProductsForWarehouse,
  searchPaginatedProductsForWarehouse,
  createProduct,
  updateProduct,
  setProductImage,
  findOwnedProductOrThrow,
  applyProductUpdate,
  importProductsFromExcel,
};
