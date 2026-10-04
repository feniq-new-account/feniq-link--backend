function serializeCatalogItem(item) {
  return {
    id: item._id,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    manufacturerAr: item.manufacturerAr,
    manufacturerEn: item.manufacturerEn,
    // Additive (catalog overhaul): the central manufacturer and image.
    manufacturerId: item.manufacturerId ?? null,
    imageUrl: item.imageUrl ?? null,
    imageMatch: item.imageMatch ?? null,
    activeIngredient: item.activeIngredient ?? null,
    strength: item.strength ?? null,
    dosageForm: item.dosageForm ?? null,
    categoryId: item.categoryId,
    unitAr: item.unitAr,
    unitEn: item.unitEn,
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toCatalogItemResponse(item) {
  return { item: serializeCatalogItem(item) };
}

function toCatalogListResponse(items) {
  return { items: items.map(serializeCatalogItem) };
}

module.exports = { serializeCatalogItem, toCatalogItemResponse, toCatalogListResponse };
