function serializeWarehouseBanner(banner) {
  return {
    id: banner._id,
    bannerNumber: banner.bannerNumber,
    imageUrl: banner.imageUrl,
    productId: banner.productId,
    // Additive (catalog overhaul Phase 10): the linked product's name, on the
    // list response - what the edit form's product picker shows.
    productNameAr: banner.$locals?.linkedProduct?.nameAr ?? null,
    productNameEn: banner.$locals?.linkedProduct?.nameEn ?? null,
    manufacturerAr: banner.manufacturerAr,
    title: banner.title,
    status: banner.status,
    rejectionNote: banner.rejectionNote,
    startDate: banner.startDate,
    endDate: banner.endDate,
    createdAt: banner.createdAt,
  };
}

function toWarehouseBannerResponse(banner) {
  return { banner: serializeWarehouseBanner(banner) };
}

function toWarehouseBannersResponse(banners) {
  return { banners: banners.map(serializeWarehouseBanner) };
}

module.exports = { toWarehouseBannerResponse, toWarehouseBannersResponse };
