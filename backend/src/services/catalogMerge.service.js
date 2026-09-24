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

module.exports = { analyzeGroup, mergeCatalogItems };
