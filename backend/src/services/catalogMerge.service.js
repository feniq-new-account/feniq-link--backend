const { ApiError } = require('../utils/ApiError');
const ProductCatalog = require('../models/productCatalog.model');
const Product = require('../models/product.model');
const Offer = require('../models/offer.model');
const Advertisement = require('../models/advertisement.model');
const WarehouseProductAlias = require('../models/warehouseProductAlias.model');
const CatalogRequest = require('../models/catalogRequest.model');
const ImportBatchRow = require('../models/importBatchRow.model');
const CatalogDuplicateReview = require('../models/catalogDuplicateReview.model');

// Merging catalog items that are the same medicine (one identity, several
// documents). Used by scripts/migrations/04-dedupe-catalog.js for the groups
// it can merge on its own, by the admin's Duplicate review screen for the ones
// it cannot, and by manufacturer.service.js when merging two manufacturers
// makes two of their items collide. One routine, so all three merge the same
// way.

// Whether a group can be merged without anyone deciding anything:
//  - no warehouse has products linked to more than one item of the group
//    (otherwise merging would give it two products for one medicine, and
//    someone has to pick which one it keeps), and
//  - every item agrees on being active (merging an active item into a
//    withdrawn one - or the reverse - silently changes what pharmacies see).
async function analyzeGroup(itemIds, { session } = {}) {
  const items = await ProductCatalog.find({ _id: { $in: itemIds } })
    .select('isActive')
    .session(session ?? null)
    .lean();
  const reasons = [];

  const linkCounts = await Product.aggregate([
    { $match: { masterProductId: { $in: items.map((item) => item._id) } } },
    { $group: { _id: '$warehouseId', linkedItems: { $addToSet: '$masterProductId' } } },
    { $match: { 'linkedItems.1': { $exists: true } } },
  ]).session(session ?? null);
  if (linkCounts.length > 0) reasons.push('warehouse_linked_to_several');

  if (new Set(items.map((item) => item.isActive !== false)).size > 1) {
    reasons.push('mixed_active_state');
  }

  return {
    safe: reasons.length === 0,
    reasons,
    conflictingWarehouseIds: linkCounts.map((row) => row._id),
  };
}

// Merges `loserIds` into `survivorId`, inside the caller's transaction.
//
// `keepProductByWarehouse` ({ [warehouseId]: productId }) is required for
// every warehouse linked to more than one item of the group: it names the
// product that warehouse keeps. Its other product(s) for this medicine are
// removed - their offers are stopped (or moved onto the kept product when it
// has none running) and any package line pointing at them is repointed to the
// kept product, so nothing is left referencing a deleted product.
//
// Survivor fields that are empty are filled from the losers (image first of
// all - an image any duplicate had is kept); the survivor's own values win.
async function mergeCatalogItems({ survivorId, loserIds, keepProductByWarehouse = {} }, session) {
  const losers = loserIds.map(String).filter((id) => id !== String(survivorId));
  if (losers.length === 0) return { mergedCount: 0, removedProductIds: [] };

  const survivor = await ProductCatalog.findById(survivorId).session(session);
  if (!survivor) {
    throw ApiError.notFound('Catalog item not found.', 'CATALOG_ITEM_NOT_FOUND');
  }
  const loserItems = await ProductCatalog.find({ _id: { $in: losers } }).session(session);
  if (loserItems.length !== losers.length) {
    throw ApiError.notFound('Catalog item not found.', 'CATALOG_ITEM_NOT_FOUND');
  }

  const groupIds = [survivor._id, ...loserItems.map((item) => item._id)];
  const products = await Product.find({ masterProductId: { $in: groupIds } })
    .select('warehouseId masterProductId')
    .session(session)
    .lean();

  // Per warehouse: which product survives, and which (if any) go.
  const byWarehouse = new Map();
  for (const product of products) {
    const key = String(product.warehouseId);
    if (!byWarehouse.has(key)) byWarehouse.set(key, []);
    byWarehouse.get(key).push(product);
  }

  const removed = []; // { productId, keptProductId }
  for (const [warehouseId, warehouseProducts] of byWarehouse) {
    if (warehouseProducts.length < 2) continue;
    const keepId = keepProductByWarehouse[warehouseId];
    const kept = keepId && warehouseProducts.find((p) => String(p._id) === String(keepId));
    if (!kept) {
      throw ApiError.badRequest(
        'A warehouse has products linked to more than one of these items - choose which one it keeps.',
        { warehouseId, productIds: warehouseProducts.map((p) => p._id) },
        'MERGE_PRODUCT_CHOICE_REQUIRED'
      );
    }
    for (const product of warehouseProducts) {
      if (String(product._id) !== String(kept._id)) {
        removed.push({ productId: product._id, keptProductId: kept._id });
      }
    }
  }

  for (const { productId, keptProductId } of removed) {
    await retireDuplicateProduct(productId, keptProductId, session);
  }

  // Everything still linked to a loser moves to the survivor. Same identity
  // means same keys; the English key and manufacturer come from the survivor.
  await Product.updateMany(
    { masterProductId: { $in: loserItems.map((item) => item._id) } },
    {
      $set: {
        masterProductId: survivor._id,
        nameKey: survivor.nameKey,
        nameEnKey: survivor.nameEnKey,
        manufacturerKey: survivor.manufacturerKey,
        manufacturerEnKey: survivor.manufacturerEnKey,
        manufacturerId: survivor.manufacturerId,
      },
    },
    { session }
  );

  const loserObjectIds = loserItems.map((item) => item._id);
  await WarehouseProductAlias.updateMany(
    { masterProductId: { $in: loserObjectIds } },
    { $set: { masterProductId: survivor._id } },
    { session }
  );
  await CatalogRequest.updateMany(
    { resolvedMasterProductId: { $in: loserObjectIds } },
    { $set: { resolvedMasterProductId: survivor._id } },
    { session }
  );
  await ImportBatchRow.updateMany(
    { masterProductId: { $in: loserObjectIds } },
    { $set: { masterProductId: survivor._id } },
    { session }
  );

  for (const field of ['imageUrl', 'nameEn', 'manufacturerEn', 'categoryId', 'unitAr', 'unitEn', 'priceUsd']) {
    if (survivor[field] == null) {
      const donor = loserItems.find((item) => item[field] != null);
      if (donor) survivor[field] = donor[field];
    }
  }

  // The losers go first: the survivor's identityKey is unique, and on the
  // manufacturer-merge path the survivor is about to take the same key.
  await ProductCatalog.deleteMany({ _id: { $in: loserObjectIds } }, { session });
  await survivor.save({ session });

  await CatalogDuplicateReview.updateMany(
    { status: 'open', catalogItemIds: survivor._id },
    { $set: { status: 'resolved', survivorId: survivor._id, resolvedAt: new Date() } },
    { session }
  );

  return { mergedCount: loserItems.length, removedProductIds: removed.map((r) => r.productId) };
}

// A warehouse's second product for one medicine, going away in favour of
// `keptProductId`. Offers on it are moved to the kept product when that one has
// none running or waiting, otherwise stopped; package lines are repointed.
async function retireDuplicateProduct(productId, keptProductId, session) {
  const keptHasOffer = await Offer.exists({
    productId: keptProductId,
    status: { $in: ['pending', 'approved'] },
  }).session(session);

  const offers = await Offer.find({ productId, status: { $in: ['pending', 'approved'] } }).session(session);
  let moved = false;
  for (const offer of offers) {
    if (!keptHasOffer && !moved) {
      offer.productId = keptProductId;
      moved = true;
    } else {
      offer.status = 'stopped';
      offer.stoppedAt = new Date();
      offer.stoppedReason = 'duplicate_merge';
      offer.pendingUpdate = null;
    }
    if (offer.pendingUpdate && String(offer.pendingUpdate.productId) === String(productId)) {
      offer.pendingUpdate.productId = keptProductId;
    }
    await offer.save({ session });
  }

  // A package holding both products would end up with the kept one twice -
  // those lines are folded into one, quantities added.
  const packages = await Advertisement.find({ 'items.productId': productId }).session(session);
  for (const advertisement of packages) {
    const merged = new Map();
    for (const item of advertisement.items) {
      const id = String(item.productId) === String(productId) ? String(keptProductId) : String(item.productId);
      merged.set(id, (merged.get(id) ?? 0) + item.quantity);
    }
    advertisement.items = [...merged].map(([id, quantity]) => ({ productId: id, quantity }));
    await advertisement.save({ session });
  }

  await Product.deleteOne({ _id: productId }, { session });
}

// ---------------------------------------------------------------------------
// The admin's Duplicate review screen (catalog overhaul Phase 5.2)
// ---------------------------------------------------------------------------

async function listDuplicateReviews({ status = 'open', limit = 20, after = null } = {}) {
  const filter = { status };
  if (after) filter._id = { $gt: after };
  const reviews = await CatalogDuplicateReview.find(filter).sort({ _id: 1 }).limit(limit + 1).lean();
  const hasMore = reviews.length > limit;
  const page = hasMore ? reviews.slice(0, limit) : reviews;

  // Each group with its items and, per item, the warehouses stocking it -
  // what the admin needs to pick a survivor and, where a warehouse has both,
  // which of its products to keep.
  const itemIds = page.flatMap((review) => review.catalogItemIds);
  const [items, products] = await Promise.all([
    ProductCatalog.find({ _id: { $in: itemIds } })
      .select('nameAr nameEn manufacturerAr imageUrl isActive priceUsd createdAt')
      .lean(),
    Product.find({ masterProductId: { $in: itemIds } })
      .select('warehouseId masterProductId price isActive manuallyDisabled')
      .populate({ path: 'warehouseId', select: 'nameAr nameEn' })
      .lean(),
  ]);
  const productsByItem = new Map();
  for (const product of products) {
    const key = String(product.masterProductId);
    if (!productsByItem.has(key)) productsByItem.set(key, []);
    productsByItem.get(key).push({
      productId: product._id,
      warehouseId: product.warehouseId?._id ?? product.warehouseId,
      warehouseNameAr: product.warehouseId?.nameAr ?? null,
      warehouseNameEn: product.warehouseId?.nameEn ?? null,
      priceUsd: product.price,
      isActive: product.isActive,
    });
  }
  const itemById = new Map(items.map((item) => [String(item._id), item]));

  return {
    rows: page.map((review) => ({
      id: review._id,
      identityKey: review.identityKey,
      reasons: review.reasons,
      status: review.status,
      items: review.catalogItemIds
        .map((itemId) => itemById.get(String(itemId)))
        .filter(Boolean)
        .map((item) => ({
          id: item._id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          manufacturerAr: item.manufacturerAr,
          imageUrl: item.imageUrl ?? null,
          isActive: item.isActive !== false,
          priceUsd: item.priceUsd ?? null,
          createdAt: item.createdAt,
          products: productsByItem.get(String(item._id)) ?? [],
        })),
    })),
    hasMore,
    nextCursor: page.length ? String(page[page.length - 1]._id) : null,
  };
}

// Resolves one open group: every other item is merged into `survivorId`, with
// the admin's choice of product for each warehouse that had more than one.
// One transaction, the same routine the migration uses. If the survivor is a
// withdrawn item, the products moved onto it are recalled with it - nothing
// stays live under a withdrawn medicine.
async function resolveDuplicateReview(reviewId, adminId, { survivorId, keepProductByWarehouse = {} } = {}) {
  const { runInTransaction } = require('../utils/transaction');
  const { recallLinkedProducts } = require('./productCatalog.service');
  const review = await CatalogDuplicateReview.findOne({ _id: reviewId, status: 'open' }).lean();
  if (!review) throw ApiError.notFound('Duplicate group not found.', 'DUPLICATE_REVIEW_NOT_FOUND');
  const ids = review.catalogItemIds.map(String);
  if (!survivorId || !ids.includes(String(survivorId))) {
    throw ApiError.badRequest('Choose which item to keep.', undefined, 'INVALID_SURVIVOR');
  }

  let result;
  await runInTransaction(async (session) => {
    result = await mergeCatalogItems(
      { survivorId, loserIds: ids.filter((id) => id !== String(survivorId)), keepProductByWarehouse },
      session
    );
    const survivor = await ProductCatalog.findById(survivorId).session(session);
    if (survivor && survivor.isActive === false) await recallLinkedProducts(survivor, session);
    await CatalogDuplicateReview.updateOne(
      { _id: review._id },
      { $set: { status: 'resolved', survivorId, resolvedBy: adminId, resolvedAt: new Date() } },
      { session }
    );
  });
  return result;
}

module.exports = { analyzeGroup, mergeCatalogItems, listDuplicateReviews, resolveDuplicateReview };
