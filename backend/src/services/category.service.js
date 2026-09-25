const mongoose = require('mongoose');
const Category = require('../models/category.model');
const ProductCatalog = require('../models/productCatalog.model');
const Product = require('../models/product.model');
const { ApiError } = require('../utils/ApiError');
const { normalizeText } = require('../utils/normalizeText');
const { runInTransaction } = require('../utils/transaction');

async function listCategories() {
  // .lean(): read-only reference data, straight into category.viewmodel.js.
  // .select(): serializeCategory emits id/nameAr/nameEn/icon/sortOrder and
  // nothing else - only the timestamps are dropped here.
  return Category.find()
    .select('nameAr nameEn icon sortOrder')
    .sort({ sortOrder: 1, nameEn: 1 })
    .lean();
}

// ---------------------------------------------------------------------------
// The admin catalog import's categories
// ---------------------------------------------------------------------------
//
// A category cell matches an existing category by its Arabic or English name
// after normalizeText ("صادات حيوية" = "صادات حيويه"). One that matches none is
// created - the text as written in the file, trimmed, as both of its names
// until an admin renames it (the model requires both) - once per file,
// whatever spelling variants of it the file uses. New categories go after the
// existing ones.
async function categoryResolverForImport() {
  const categories = await Category.find({}).select('nameAr nameEn sortOrder').lean();
  const idByKey = new Map();
  let nextSortOrder = 0;
  for (const category of categories) {
    for (const name of [category.nameAr, category.nameEn]) {
      const key = normalizeText(name);
      if (key && !idByKey.has(key)) idByKey.set(key, category._id);
    }
    nextSortOrder = Math.max(nextSortOrder, (category.sortOrder ?? 0) + 1);
  }
  const created = new Map(); // String(id) -> { id, nameAr, items }

  return {
    // The category for a cell (null for an empty one), created if needed.
    async resolve(text) {
      const name = typeof text === 'string' ? text.trim() : '';
      const key = normalizeText(name);
      if (!key) return null;
      if (idByKey.has(key)) return idByKey.get(key);
      const category = await Category.create({ nameAr: name, nameEn: name, sortOrder: nextSortOrder });
      nextSortOrder += 1;
      idByKey.set(key, category._id);
      created.set(String(category._id), { id: category._id, nameAr: name, items: 0 });
      return category._id;
    },
    // Counts an item filed under a category this import created.
    countItem(categoryId) {
      const entry = categoryId && created.get(String(categoryId));
      if (entry) entry.items += 1;
    },
    // [{ id, nameAr, items }] - the categories this import created.
    createdCategories() {
      return [...created.values()];
    },
  };
}

// ---------------------------------------------------------------------------
// The admin's Categories screen: rename and merge
// ---------------------------------------------------------------------------

async function findCategoryOrThrow(id, session = null) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw ApiError.notFound('Category not found.', 'CATEGORY_NOT_FOUND');
  }
  const category = await Category.findById(id).session(session);
  if (!category) throw ApiError.notFound('Category not found.', 'CATEGORY_NOT_FOUND');
  return category;
}

// Every category with how many catalog items and warehouse products it holds.
// Categories are a short reference list, so the whole list is one response.
async function listCategoriesWithCounts() {
  const [categories, catalogCounts, productCounts] = await Promise.all([
    Category.find().select('nameAr nameEn icon sortOrder').sort({ sortOrder: 1, nameEn: 1 }).lean(),
    ProductCatalog.aggregate([{ $match: { categoryId: { $ne: null } } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
    Product.aggregate([{ $match: { categoryId: { $ne: null } } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
  ]);
  const catalogById = new Map(catalogCounts.map((row) => [String(row._id), row.count]));
  const productsById = new Map(productCounts.map((row) => [String(row._id), row.count]));
  return categories.map((category) => ({
    ...category,
    catalogItemCount: catalogById.get(String(category._id)) ?? 0,
    productCount: productsById.get(String(category._id)) ?? 0,
  }));
}

// Renames a category. Items point at it by id, so every catalog item and
// warehouse product stays filed under it. A name that is already another
// category's (after normalizeText) is refused with that category's id - the
// admin merges the two instead.
async function renameCategory(id, changes = {}) {
  const category = await findCategoryOrThrow(id);
  const nextName = (value, current) => {
    if (value === undefined) return current;
    if (typeof value !== 'string' || !value.trim()) {
      throw ApiError.badRequest('A category needs an Arabic and an English name.', undefined, 'INVALID_CATEGORY_NAME');
    }
    return value.trim();
  };
  const nameAr = nextName(changes.nameAr, category.nameAr);
  const nameEn = nextName(changes.nameEn, category.nameEn);

  const keys = [...new Set([normalizeText(nameAr), normalizeText(nameEn)].filter(Boolean))];
  const others = await Category.find({ _id: { $ne: category._id } }).select('nameAr nameEn').lean();
  const clash = others.find((other) => [other.nameAr, other.nameEn].some((name) => keys.includes(normalizeText(name))));
  if (clash) {
    throw ApiError.conflict('Another category already has this name - merge the two instead.', 'CATEGORY_ALREADY_EXISTS', {
      categoryId: clash._id,
    });
  }

  category.nameAr = nameAr;
  category.nameEn = nameEn;
  await category.save();
  return category;
}

// Merges category `sourceId` into `targetId`: every catalog item and warehouse
// product filed under the source moves to the target, and the source is
// deleted - all in one transaction. The first call (without `confirmed`) is
// refused with how many items would move, so the admin sees the scale before
// agreeing to it.
async function mergeCategory(targetId, sourceId, { confirmed = false } = {}) {
  if (!sourceId || String(sourceId) === String(targetId)) {
    throw ApiError.badRequest('Pick another category to merge into this one.', undefined, 'INVALID_MERGE');
  }
  const [target, source] = await Promise.all([findCategoryOrThrow(targetId), findCategoryOrThrow(sourceId)]);
  const [catalogItemCount, productCount] = await Promise.all([
    ProductCatalog.countDocuments({ categoryId: source._id }),
    Product.countDocuments({ categoryId: source._id }),
  ]);
  if (!confirmed) {
    throw ApiError.badRequest(
      `Merging moves ${catalogItemCount} catalog item(s) and ${productCount} warehouse product(s).`,
      {
        catalogItemCount,
        productCount,
        source: { id: source._id, nameAr: source.nameAr, nameEn: source.nameEn },
        target: { id: target._id, nameAr: target.nameAr, nameEn: target.nameEn },
      },
      'CATEGORY_MERGE_NEEDS_CONFIRMATION'
    );
  }

  let moved = { catalogItems: 0, products: 0 };
  await runInTransaction(async (session) => {
    const catalogResult = await ProductCatalog.updateMany(
      { categoryId: source._id },
      { $set: { categoryId: target._id } },
      { session }
    );
    const productResult = await Product.updateMany(
      { categoryId: source._id },
      { $set: { categoryId: target._id } },
      { session }
    );
    await Category.deleteOne({ _id: source._id }, { session });
    moved = { catalogItems: catalogResult.modifiedCount, products: productResult.modifiedCount };
  });
  return { category: target, moved };
}

module.exports = {
  listCategories,
  categoryResolverForImport,
  findCategoryOrThrow,
  listCategoriesWithCounts,
  renameCategory,
  mergeCategory,
};
