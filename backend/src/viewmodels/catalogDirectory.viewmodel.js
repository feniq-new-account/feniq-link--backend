// One directory row as the phone stores it. Empty fields are left out (the JSON
// is megabytes across 13,000 items, and the app reads a missing key as none).
function serializeDirectoryItem(item) {
  const row = {
    id: String(item._id),
    nameAr: item.nameAr,
    manufacturerAr: item.manufacturerAr,
    updatedAt: item.updatedAt,
  };
  if (item.nameEn) row.nameEn = item.nameEn;
  if (item.manufacturerEn) row.manufacturerEn = item.manufacturerEn;
  if (item.activeIngredient) row.activeIngredient = item.activeIngredient;
  if (item.strength) row.strength = item.strength;
  if (item.dosageForm) row.dosageForm = item.dosageForm;
  if (item.imageUrl) row.imageUrl = item.imageUrl;
  if (item.categoryId) row.categoryId = String(item.categoryId);
  if (item.isActive === false) row.isActive = false;
  return row;
}

function toDirectoryResponse({ items, hasMore, nextCursor, total }) {
  return {
    items: items.map(serializeDirectoryItem),
    // `total` only comes with the first page (no cursor).
    pagination: { hasMore, nextCursor: hasMore ? nextCursor : null, ...(total === null || total === undefined ? {} : { total }) },
  };
}

module.exports = { toDirectoryResponse, serializeDirectoryItem };
