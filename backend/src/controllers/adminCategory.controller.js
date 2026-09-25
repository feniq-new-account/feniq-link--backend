const { asyncHandler } = require('../utils/asyncHandler');
const categoryService = require('../services/category.service');

// The admin's Categories screen: every category with how many catalog items
// and warehouse products it holds, renaming, and merging one into another.

function serializeAdminCategory(category) {
  return {
    id: category._id,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    icon: category.icon ?? null,
    sortOrder: category.sortOrder ?? 0,
    catalogItemCount: category.catalogItemCount ?? undefined,
    productCount: category.productCount ?? undefined,
  };
}

const list = asyncHandler(async (req, res) => {
  const categories = await categoryService.listCategoriesWithCounts();
  res.json({ success: true, categories: categories.map(serializeAdminCategory) });
});

const update = asyncHandler(async (req, res) => {
  const category = await categoryService.renameCategory(req.params.id, req.body || {});
  res.json({ success: true, category: serializeAdminCategory(category) });
});

// Merges `sourceId` into the category in the URL. Without `confirmed: true`
// the answer is CATEGORY_MERGE_NEEDS_CONFIRMATION with how many items move.
const merge = asyncHandler(async (req, res) => {
  const { category, moved } = await categoryService.mergeCategory(req.params.id, req.body?.sourceId, {
    confirmed: req.body?.confirmed === true,
  });
  res.json({ success: true, category: serializeAdminCategory(category), moved });
});

module.exports = { list, update, merge };
