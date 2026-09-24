const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { normalizeText } = require('../utils/normalizeText');
const Manufacturer = require('../models/manufacturer.model');
const ProductCatalog = require('../models/productCatalog.model');
const Product = require('../models/product.model');
const ManufacturerDiscount = require('../models/manufacturerDiscount.model');
const WarehouseManufacturer = require('../models/warehouseManufacturer.model');
const CatalogRequest = require('../models/catalogRequest.model');
const { analyzeGroup, mergeCatalogItems } = require('./catalogMerge.service');
const { escapeRegex } = require('./productCatalog.service');

// The central Manufacturer entity (manufacturer.model.js): listing, renaming
// and merging. Every copy of a manufacturer's name elsewhere - the catalog
// items' manufacturerAr/manufacturerKey (and so their identityKey), the
// products' manufacturerKey, the discounts' and registry's display name - is
// rewritten here in the same transaction as the change itself, so no screen
// can show a company under a name the Manufacturer no longer has.

const DEFAULT_LIMIT = 30;

async function findManufacturerOrThrow(id, session = null) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Manufacturer not found.', 'MANUFACTURER_NOT_FOUND');
  }
  const manufacturer = await Manufacturer.findById(id).session(session);
  if (!manufacturer) {
    throw ApiError.notFound('Manufacturer not found.', 'MANUFACTURER_NOT_FOUND');
  }
  return manufacturer;
}

// The admin's list: newest-id-last cursor pagination like every other admin
// list, searched on the normalized key (so a hamza/spacing variant finds it)
// and on the English name.
async function listManufacturers({ search, limit = DEFAULT_LIMIT, after = null } = {}) {
  const filter = {};
  const term = typeof search === 'string' ? normalizeText(search) : '';
  if (term) {
    const pattern = new RegExp(escapeRegex(term));
    filter.$or = [{ key: pattern }, { nameEn: new RegExp(escapeRegex(search.trim()), 'i') }];
  }
  if (after) filter._id = { $gt: after };

  const rows = await Manufacturer.find(filter).sort({ _id: 1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const counts = page.length
    ? await ProductCatalog.aggregate([
        { $match: { manufacturerId: { $in: page.map((m) => m._id) } } },
        { $group: { _id: '$manufacturerId', count: { $sum: 1 } } },
      ])
    : [];
  const countById = new Map(counts.map((row) => [String(row._id), row.count]));
  return {
    items: page.map((m) => ({ ...m, catalogItemCount: countById.get(String(m._id)) ?? 0 })),
    hasMore,
    nextCursor: page.length > 0 ? String(page[page.length - 1]._id) : null,
  };
}

// Rewrites every denormalized copy of one manufacturer's name/key. Catalog
// items get their identityKey rebuilt from their own nameKey and the new key
// (a pipeline update, since it differs per item).
async function syncManufacturerCopies(manufacturer, session) {
  const { _id: manufacturerId, nameAr, nameEn, key } = manufacturer;
  // Pipeline updates read a string starting with "$" as a field path, so every
  // admin-typed value goes in as a $literal. The English key follows the
  // manufacturer's English name when it has one; otherwise each item keeps the
  // key of its own manufacturerEn.
  const enKey = nameEn ? { $literal: normalizeText(nameEn) } : '$manufacturerEnKey';
  await ProductCatalog.updateMany(
    { manufacturerId },
    [
      {
        $set: {
          manufacturerAr: { $literal: nameAr },
          manufacturerEn: nameEn ? { $literal: nameEn } : '$manufacturerEn',
          manufacturerKey: { $literal: key },
          manufacturerEnKey: enKey,
          identityKey: { $concat: [{ $ifNull: ['$nameKey', ''] }, '|', { $literal: key }] },
        },
      },
    ],
    { session }
  );
  await Product.updateMany(
    { manufacturerId },
    [{ $set: { manufacturerKey: { $literal: key }, manufacturerEnKey: enKey } }],
    { session }
  );
  // A legacy product (no catalog link) displays its own manufacturer text -
  // it follows the rename too.
  await Product.updateMany(
    { manufacturerId, masterProductId: null },
    { $set: { manufacturerAr: nameAr } },
    { session }
  );
  await ManufacturerDiscount.updateMany({ manufacturerId }, { $set: { manufacturerAr: nameAr } }, { session });
  await WarehouseManufacturer.updateMany({ manufacturerId }, { $set: { manufacturerAr: nameAr } }, { session });
}

// Admin edit of the names. A rename whose normalized key already belongs to
// another manufacturer is not a rename but a merge - refused with that
// manufacturer's id so the panel can offer the merge instead.
async function updateManufacturer(id, changes) {
  return runInTransaction(async (session) => {
    const manufacturer = await findManufacturerOrThrow(id, session);

    if (changes.nameAr !== undefined) {
      if (typeof changes.nameAr !== 'string' || !normalizeText(changes.nameAr)) {
        throw ApiError.badRequest('Invalid name.', undefined, 'INVALID_MANUFACTURER_NAME');
      }
      manufacturer.nameAr = changes.nameAr.trim();
    }
    if (changes.nameEn !== undefined) {
      manufacturer.nameEn =
        typeof changes.nameEn === 'string' && changes.nameEn.trim() ? changes.nameEn.trim() : null;
    }
    if (changes.isActive !== undefined) {
      manufacturer.isActive = changes.isActive === true;
    }

    const namesChanged = manufacturer.isModified('nameAr') || manufacturer.isModified('nameEn');
    if (manufacturer.isModified('nameAr')) {
      const clash = await Manufacturer.findOne({
        key: normalizeText(manufacturer.nameAr),
        _id: { $ne: manufacturer._id },
      })
        .select('_id nameAr')
        .session(session)
        .lean();
      if (clash) {
        throw ApiError.conflict(
          'Another manufacturer already has this name - merge the two instead.',
          'MANUFACTURER_ALREADY_EXISTS',
          { manufacturerId: clash._id, nameAr: clash.nameAr }
        );
      }
    }

    await manufacturer.save({ session });
    if (namesChanged) await syncManufacturerCopies(manufacturer, session);
    return manufacturer;
  });
}

// Sets or clears the logo (Cloudinary URL, already validated by the caller).
// Admin only - a warehouse never overrides a manufacturer's logo.
async function setManufacturerLogo(id, logoUrl) {
  const manufacturer = await findManufacturerOrThrow(id);
  const previous = manufacturer.logoUrl;
  manufacturer.logoUrl = logoUrl ?? null;
  await manufacturer.save();
  return { manufacturer, previousLogoUrl: previous };
}

// Folds `sourceId` into `targetId`: every catalog item, product, discount,
// registry row and catalog request of the source moves to the target, the
// target keeps its logo (or takes the source's when it has none), and the
// source is deleted.
//
// Two catalog items - one under each manufacturer - that are the same medicine
// would collide on identityKey once they share a manufacturer. Those pairs are
// merged through catalogMerge.service.js when that is safe; when it is not (a
// warehouse stocks both, or they disagree on being active) the whole merge is
// refused and the pairs listed, for the admin to resolve first.
//
// Discounts: one warehouse can end up with a discount on both. The higher
// percentage is kept (the warehouse's more generous commitment), and the
// clash is reported back.
async function mergeManufacturers(targetId, sourceId, { session: outerSession } = {}) {
  if (String(targetId) === String(sourceId)) {
    throw ApiError.badRequest('Cannot merge a manufacturer into itself.', undefined, 'INVALID_MERGE');
  }

  const work = async (session) => {
    const target = await findManufacturerOrThrow(targetId, session);
    const source = await findManufacturerOrThrow(sourceId, session);

    // Same-medicine pairs across the two manufacturers.
    const sourceItems = await ProductCatalog.find({ manufacturerId: source._id })
      .select('nameKey')
      .session(session)
      .lean();
    const collisions = sourceItems.length
      ? await ProductCatalog.find({
          manufacturerId: target._id,
          nameKey: { $in: sourceItems.map((item) => item.nameKey) },
        })
          .select('nameKey')
          .session(session)
          .lean()
      : [];
    const targetItemByNameKey = new Map(collisions.map((item) => [item.nameKey, item._id]));

    const unsafe = [];
    const pairs = [];
    for (const sourceItem of sourceItems) {
      const targetItemId = targetItemByNameKey.get(sourceItem.nameKey);
      if (!targetItemId) continue;
      const analysis = await analyzeGroup([targetItemId, sourceItem._id], { session });
      if (!analysis.safe) unsafe.push({ targetItemId, sourceItemId: sourceItem._id, reasons: analysis.reasons });
      else pairs.push({ targetItemId, sourceItemId: sourceItem._id });
    }
    if (unsafe.length > 0) {
      throw ApiError.conflict(
        'Some medicines exist under both manufacturers and need a decision first (Duplicate review).',
        'MANUFACTURER_MERGE_CONFLICT',
        { conflicts: unsafe }
      );
    }

    // The colliding source items are folded into their target twins first,
    // so that by the time the remaining source items are repointed and their
    // identityKey rebuilt with the target's key (syncManufacturerCopies), none
    // of them can clash with an existing target item.
    for (const { targetItemId, sourceItemId } of pairs) {
      await mergeCatalogItems({ survivorId: targetItemId, loserIds: [sourceItemId] }, session);
    }

    await ProductCatalog.updateMany({ manufacturerId: source._id }, { $set: { manufacturerId: target._id } }, { session });
    await Product.updateMany({ manufacturerId: source._id }, { $set: { manufacturerId: target._id } }, { session });
    await CatalogRequest.updateMany({ manufacturerId: source._id }, { $set: { manufacturerId: target._id } }, { session });

    // Discounts, per warehouse.
    const discountClashes = [];
    const sourceDiscounts = await ManufacturerDiscount.find({ manufacturerId: source._id }).session(session);
    for (const discount of sourceDiscounts) {
      const existing = await ManufacturerDiscount.findOne({
        warehouseId: discount.warehouseId,
        manufacturerId: target._id,
      }).session(session);
      if (!existing) {
        discount.manufacturerId = target._id;
        await discount.save({ session });
        continue;
      }
      if (existing.discountPercentage !== discount.discountPercentage) {
        discountClashes.push({
          warehouseId: discount.warehouseId,
          kept: Math.max(existing.discountPercentage, discount.discountPercentage),
          dropped: Math.min(existing.discountPercentage, discount.discountPercentage),
        });
      }
      existing.discountPercentage = Math.max(existing.discountPercentage, discount.discountPercentage);
      await existing.save({ session });
      await discount.deleteOne({ session });
    }

    // Registry rows, per warehouse.
    const sourceRegistry = await WarehouseManufacturer.find({ manufacturerId: source._id }).session(session);
    for (const row of sourceRegistry) {
      const exists = await WarehouseManufacturer.exists({
        warehouseId: row.warehouseId,
        manufacturerId: target._id,
      }).session(session);
      if (exists) await row.deleteOne({ session });
      else {
        row.manufacturerId = target._id;
        await row.save({ session });
      }
    }

    if (!target.logoUrl && source.logoUrl) target.logoUrl = source.logoUrl;
    if (!target.nameEn && source.nameEn) target.nameEn = source.nameEn;
    await source.deleteOne({ session });
    await target.save({ session });
    await syncManufacturerCopies(target, session);

    return { manufacturer: target, mergedCatalogPairs: pairs.length, discountClashes };
  };

  return outerSession ? work(outerSession) : runInTransaction(work);
}

module.exports = {
  listManufacturers,
  findManufacturerOrThrow,
  updateManufacturer,
  setManufacturerLogo,
  mergeManufacturers,
  syncManufacturerCopies,
};
