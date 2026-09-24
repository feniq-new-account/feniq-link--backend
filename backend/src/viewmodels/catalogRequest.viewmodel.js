function serializeCatalogRequest({ request, warehouse }) {
  return {
    id: request._id,
    warehouseId: request.warehouseId,
    warehouseNameAr: warehouse ? warehouse.nameAr : null,
    warehouseNameEn: warehouse ? warehouse.nameEn : null,
    nameAr: request.nameAr ?? null,
    // Additive: requests may name the medicine in English only.
    nameEn: request.nameEn ?? null,
    manufacturerAr: request.manufacturerAr,
    manufacturerId: request.manufacturerId ?? null,
    unit: request.unit ?? null,
    priceUsd: request.priceUsd,
    bonuses: (request.bonuses ?? []).map((tier) => ({ buy: tier.buy, free: tier.free })),
    status: request.status,
    rejectReason: request.rejectReason ?? null,
    resolvedMasterProductId: request.resolvedMasterProductId ?? null,
    productId: request.productId ?? null,
    importBatchId: request.importBatchId ?? null,
    createdAt: request.createdAt,
    resolvedAt: request.resolvedAt ?? null,
  };
}

module.exports = { serializeCatalogRequest };
