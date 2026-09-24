const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const ProductCatalog = require('../models/productCatalog.model');
const { searchKey } = require('../models/productCatalog.model');
const {
  applyResolvedIdentity,
  loadAndParseUpload,
  buildProductFilter,
  findProductPage,
} = require('./productCatalog.service');
const { registerManufacturers } = require('./warehouseManufacturer.service');
const { assertRateUsedIsCurrent } = require('./exchangeRate.service');
const { runInTransaction } = require('../utils/transaction');

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
  for (const [field, code] of REQUIRED_STRING_FIELDS) {
    if (typeof data[field] !== 'string' || !data[field].trim()) {
      throw ApiError.badRequest(`Invalid ${field}.`, undefined, code);
    }
  }
}

// isActive: true - a product an admin has deactivated (adminProduct.service.js)
// is gone from the warehouse's own catalog too, not just the pharmacist-facing
// one; there's no reactivate flow yet, so from the warehouse's side it's simply
// no longer there.
async function listProductsForWarehouse(warehouseId, { availableOnly = false } = {}) {
  const filter = { warehouseId, isActive: true };
  if (availableOnly) {
    filter.isAvailable = true;
  }
  const products = await Product.find(filter)
    .select(LIST_PRODUCT_SELECT)
    .populate({ path: 'masterProductId', select: 'nameAr nameEn manufacturerAr manufacturerEn' });
  products.forEach(applyResolvedIdentity);
  products.sort((a, b) => (a.nameEn || a.nameAr || '').localeCompare(b.nameEn || b.nameAr || ''));
  return products;
}

// The Products management page (unlike the callers of the unpaginated
// listProductsForWarehouse above - banner/offer "linked product" pickers,
// which need every product, alphabetically) wants newest-first with "Load
// more". An ObjectId's embedded timestamp makes `_id` descending equivalent
// to `createdAt` descending, so no compound cursor is needed.
//
// `manufacturerAr` narrows the page to one company (the catalog page opens on
// a company list and drills into it) - an EXACT company match on its
// normalized key, through the shared product search
// (productCatalog.service.js's buildProductFilter), so "Load more" keeps
// paging through that company's products only.
async function listPaginatedProductsForWarehouse(
  warehouseId,
  { limit = WAREHOUSE_PRODUCTS_DEFAULT_LIMIT, after = null, manufacturerAr = null } = {}
) {
  const filter = buildProductFilter({ warehouseId, manufacturer: manufacturerAr ?? undefined });
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
  { q = '', limit = WAREHOUSE_PRODUCTS_DEFAULT_LIMIT, after = null } = {}
) {
  const filter = buildProductFilter({ warehouseId, search: q ?? undefined });
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
//  - it disabled that product itself (manuallyDisabled) -> the product is
//    re-enabled with the new price and fields, and returned as such;
//  - the platform disabled it (recall / admin) -> refused with
//    CATALOG_ITEM_WITHDRAWN / PRODUCT_DISABLED_BY_ADMIN, nothing changes;
//  - it is live -> PRODUCT_ALREADY_LINKED, as before.
// All in one transaction that also re-checks the catalog item is still active.
async function createProduct(warehouseId, data, { requireRateUsed = false, userId = null } = {}) {
  validateRequiredStrings(data);
  await validateMasterProductId(data.masterProductId);
  await validateCategoryId(data.categoryId);
  validatePrice(data.priceUsd);
  await assertRateUsedIsCurrent(data.rateUsed, { required: requireRateUsed });

  const manuallyDisabled = data.manuallyDisabled === true;

  let product;
  let reEnabled = false;
  try {
    await runInTransaction(async (session) => {
      reEnabled = false;
      await claimActiveCatalogItem(data.masterProductId, session);

      const existing = await Product.findOne({ warehouseId, masterProductId: data.masterProductId }).session(session);
      if (existing) {
        throwIfBlocked(existing);
        if (!existing.manuallyDisabled) {
          throw ApiError.conflict('You already have a product linked to this medicine.', 'PRODUCT_ALREADY_LINKED');
        }
        product = await applyProductUpdate(
          existing,
          userId,
          {
            categoryId: data.categoryId,
            unitAr: data.unitAr,
            unitEn: data.unitEn,
            description: data.description,
            image: data.image,
            priceUsd: data.priceUsd,
            manuallyDisabled,
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
            unitAr: data.unitAr.trim(),
            unitEn: data.unitEn.trim(),
            description:
              typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null,
            image: typeof data.image === 'string' && data.image.trim() ? data.image.trim() : null,
            price: data.priceUsd,
            manuallyDisabled,
            isAvailable: computeIsAvailable(manuallyDisabled),
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
  { requireRateUsed = false, session = null, resolve = true } = {}
) {
  for (const [field, code] of REQUIRED_STRING_FIELDS) {
    if (changes[field] !== undefined) {
      if (typeof changes[field] !== 'string' || !changes[field].trim()) {
        throw ApiError.badRequest(`Invalid ${field}.`, undefined, code);
      }
      product[field] = changes[field].trim();
    }
  }

  if (changes.categoryId !== undefined) {
    await validateCategoryId(changes.categoryId);
    product.categoryId = changes.categoryId;
  }

  if (changes.description !== undefined) {
    product.description = typeof changes.description === 'string' && changes.description.trim()
      ? changes.description.trim()
      : null;
  }

  if (changes.image !== undefined) {
    product.image = typeof changes.image === 'string' && changes.image.trim()
      ? changes.image.trim()
      : null;
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
  if (!resolve) return product;

  // Same "resolve only after the write is durable" reasoning as
  // createProduct above - this response-only mutation never gets saved.
  await product.populate('masterProductId');
  return applyResolvedIdentity(product);
}

async function updateProduct(productId, warehouseId, userId, changes, options) {
  const product = await findOwnedProductOrThrow(productId, warehouseId);
  return applyProductUpdate(product, userId, changes, options);
}

// Section 14 Part 2: bulk-adds/updates this warehouse's own products from an
// Excel file shaped like generateWarehouseTemplateBuffer's output. Reuses
// the exact same row-parsing as the admin's catalog import
// (productCatalog.service.js) - the three-column (name / price / currency)
// company-row shape is identical, only what happens with each parsed row
// differs. `candidates` come back already priced in USD (SYP rows converted
// at the current rate; a missing rate has already aborted the whole import
// by this point).
async function importProductsFromExcel(warehouseId, userId, file) {
  const { candidates, errors, manufacturers, exchangeRateUsed, convertedFromSyp } = await loadAndParseUpload(file);

  // Registers every manufacturer row recognized in the file - regardless of
  // whether any of its medicines matched the central catalog, so a
  // warehouse's manufacturer registry (the Discounts tab's dropdown, see
  // warehouseManufacturer.service.js) grows the moment a company appears in
  // an import, not only once one of its products is actually linked.
  if (manufacturers.length > 0) {
    await registerManufacturers(warehouseId, manufacturers);
  }

  let added = 0;
  let updated = 0;
  // Rows whose product exists but is disabled by the platform (see below).
  const blocked = [];

  if (candidates.length === 0) {
    return { added, updated, blocked, errors, exchangeRateUsed, convertedFromSyp };
  }

  // Two bounded queries for the whole file instead of two per row. Each row
  // used to run a case-insensitive RegExp findOne against ProductCatalog -
  // which cannot use its index, so every row scanned the entire master list -
  // plus its own Product findOne and save. On a 2,000-row file against a
  // large catalog that is the single most expensive request in the app, and
  // it blocks the event loop for the whole import.
  //
  // Matched on both name and manufacturer (not name alone) - the central
  // catalog allows the same drug name under different manufacturers (Section
  // 14 Part 1's own upsert key), so name-only would risk linking to the
  // wrong one. The normalized keys (productCatalog.model.js) make that pair
  // an indexed equality match rather than a scan, and carry the same
  // case/whitespace tolerance the RegExp had.
  const keyedCandidates = candidates.map((candidate) => ({
    ...candidate,
    nameKey: searchKey(candidate.nameAr),
    manufacturerKey: searchKey(candidate.manufacturerAr),
  }));

  const catalogItems = await ProductCatalog.find({
    nameKey: { $in: [...new Set(keyedCandidates.map((c) => c.nameKey))] },
    manufacturerKey: { $in: [...new Set(keyedCandidates.map((c) => c.manufacturerKey))] },
  })
    .select('_id nameKey nameEnKey manufacturerKey manufacturerEnKey manufacturerId isActive')
    .lean();

  // The two $in clauses above match the cross-product of names and
  // manufacturers, so a row is only really matched once the exact pair is
  // found here.
  const catalogByPair = new Map(
    catalogItems.map((item) => [`${item.nameKey}\u0000${item.manufacturerKey}`, item])
  );

  const matched = [];
  for (const candidate of keyedCandidates) {
    const catalogItem = catalogByPair.get(`${candidate.nameKey}\u0000${candidate.manufacturerKey}`);
    if (!catalogItem) {
      errors.push({ row: candidate.rowNumber, reason: 'Medicine not found in the central catalog.' });
      continue;
    }
    // A withdrawn (recalled) medicine: reported as such, never created or
    // updated - whether or not this warehouse already had it.
    if (catalogItem.isActive === false) {
      blocked.push({ row: candidate.rowNumber, code: 'CATALOG_ITEM_WITHDRAWN' });
      continue;
    }
    matched.push({ candidate, catalogId: catalogItem._id, catalogItem });
  }

  if (matched.length === 0) {
    return { added, updated, blocked, errors, exchangeRateUsed, convertedFromSyp };
  }

  // Only price + priceHistory are read off an existing product, so the rest
  // of the document never needs to leave the database or become a Mongoose
  // document - the writes below are built by hand rather than via .save().
  const existingProducts = await Product.find({
    warehouseId,
    masterProductId: { $in: matched.map((m) => m.catalogId) },
  })
    .select('masterProductId price isActive deactivatedBy manuallyDisabled')
    .lean();
  const existingByCatalogId = new Map(
    existingProducts.map((product) => [String(product.masterProductId), product])
  );

  const now = new Date();
  const operations = [];
  const rowsByOperationIndex = [];

  for (const { candidate, catalogId, catalogItem } of matched) {
    const existing = existingByCatalogId.get(String(catalogId));

    // Switched off by the platform (catalog recall / admin): left exactly as
    // it is and reported in its own bucket - never counted as "updated"
    // (H3). It used to get its price rewritten while staying invisible.
    const blockedCode = blockedCodeFor(existing);
    if (blockedCode) {
      blocked.push({ row: candidate.rowNumber, code: blockedCode });
      continue;
    }

    if (existing) {
      // A price that didn't move writes no history entry and no
      // lastPriceUpdate, exactly as the per-row save did - re-importing an
      // unchanged file must not fill priceHistory with no-op entries.
      const set = {};
      const push = {};
      // A product the warehouse had disabled itself comes back on import
      // (Phase 3.4) - the file is the warehouse saying it sells it again.
      if (existing.manuallyDisabled) {
        set.manuallyDisabled = false;
        set.isAvailable = true;
      }
      if (candidate.priceUsd !== existing.price) {
        set.price = candidate.priceUsd;
        set.lastPriceUpdate = now;
        push.priceHistory = {
          // H5: the array is capped as it grows rather than left unbounded -
          // it is read back in full by the single-product response.
          $each: [
            {
              oldPrice: existing.price,
              newPrice: candidate.priceUsd,
              changedBy: userId,
              changedAt: now,
            },
          ],
          $slice: -PRICE_HISTORY_LIMIT,
        };
      }

      operations.push({
        updateOne: {
          filter: { _id: existing._id },
          update: {
            ...(Object.keys(set).length > 0 ? { $set: set } : {}),
            ...(Object.keys(push).length > 0 ? { $push: push } : {}),
          },
        },
      });
      rowsByOperationIndex.push({ row: candidate.rowNumber, kind: 'updated' });
    } else {
      // categoryId/unitAr/unitEn are left null (Section 14 Part 2's schema
      // note on product.model.js) - the import format carries no columns
      // for them, same reasoning as the catalog's own import.
      operations.push({
        insertOne: {
          document: {
            warehouseId,
            masterProductId: catalogId,
            // A bulk insert skips product.model.js's pre-validate hook, so the
            // denormalized search keys are copied from the catalog item here.
            nameKey: catalogItem.nameKey,
            nameEnKey: catalogItem.nameEnKey ?? null,
            manufacturerKey: catalogItem.manufacturerKey,
            manufacturerEnKey: catalogItem.manufacturerEnKey ?? null,
            manufacturerId: catalogItem.manufacturerId ?? null,
            price: candidate.priceUsd,
            manuallyDisabled: false,
            isAvailable: true,
            isActive: true,
            lastPriceUpdate: now,
            priceHistory: [],
            createdAt: now,
            updatedAt: now,
          },
        },
      });
      rowsByOperationIndex.push({ row: candidate.rowNumber, kind: 'added' });
    }
  }

  // ordered:false so one bad row (a duplicate racing another import of the
  // same file, say) doesn't abandon every row after it - the per-row loop
  // this replaces had that property too, via its own try/catch.
  let writeErrorIndexes = new Set();
  try {
    await Product.bulkWrite(operations, { ordered: false });
  } catch (err) {
    if (!err.writeErrors) throw err;
    writeErrorIndexes = new Set(err.writeErrors.map((writeError) => writeError.index));
    for (const writeError of err.writeErrors) {
      const source = rowsByOperationIndex[writeError.index];
      errors.push({
        row: source ? source.row : null,
        reason: 'Failed to save this row.',
      });
    }
  }

  rowsByOperationIndex.forEach((source, index) => {
    if (writeErrorIndexes.has(index)) return;
    if (source.kind === 'added') added += 1;
    else updated += 1;
  });

  return { added, updated, blocked, errors, exchangeRateUsed, convertedFromSyp };
}

module.exports = {
  listProductsForWarehouse,
  listPaginatedProductsForWarehouse,
  searchPaginatedProductsForWarehouse,
  createProduct,
  updateProduct,
  findOwnedProductOrThrow,
  applyProductUpdate,
  importProductsFromExcel,
};
