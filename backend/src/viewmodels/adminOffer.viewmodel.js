// The warehouse's proposed edit to an already-approved offer, shown next to the
// live offer so the admin can compare Current vs Proposed. null unless an edit
// is waiting.
function serializeProposedOffer(pendingUpdate, product) {
  if (!pendingUpdate) return null;
  return {
    productId: pendingUpdate.productId,
    productNameAr: product ? product.nameAr : null,
    productNameEn: product ? product.nameEn : null,
    titleAr: pendingUpdate.titleAr,
    titleEn: pendingUpdate.titleEn,
    offerType: pendingUpdate.offerType || 'discount',
    discountPercentage: pendingUpdate.discountPercentage,
    bonuses: (pendingUpdate.bonuses ?? []).map((tier) => ({ buy: tier.buy, free: tier.free })),
    startDate: pendingUpdate.startDate,
    endDate: pendingUpdate.endDate,
    isPermanent: pendingUpdate.isPermanent,
    requestedAt: pendingUpdate.requestedAt,
  };
}

function serializeOffer({ offer, product, pendingUpdateProduct, warehouse }) {
  return {
    id: offer._id,
    warehouseId: offer.warehouseId,
    warehouseNameAr: warehouse ? warehouse.nameAr : null,
    warehouseNameEn: warehouse ? warehouse.nameEn : null,
    productId: offer.productId,
    productNameAr: product ? product.nameAr : null,
    productNameEn: product ? product.nameEn : null,
    productPriceUsd: product ? product.price : null,
    titleAr: offer.titleAr,
    titleEn: offer.titleEn,
    offerType: offer.offerType || 'discount',
    discountPercentage: offer.discountPercentage,
    bonuses: (offer.bonuses ?? []).map((tier) => ({ buy: tier.buy, free: tier.free })),
    startDate: offer.startDate,
    endDate: offer.endDate,
    isPermanent: offer.isPermanent,
    status: offer.status,
    pendingUpdate: serializeProposedOffer(offer.pendingUpdate, pendingUpdateProduct),
    createdAt: offer.createdAt,
    // The version the admin is looking at - sent back on approve/reject so a
    // decision can't land on an offer the warehouse changed in the meantime.
    version: offer.__v ?? 0,
  };
}

// The moderation queue (Dashboard + the Offers page's "Review queue" filter).
function toPendingOffersResponse(rows) {
  return { offers: rows.map(serializeOffer) };
}

// Every offer, every warehouse, every status (Section 5).
function toOffersResponse(rows) {
  return { offers: rows.map(serializeOffer) };
}

module.exports = { toPendingOffersResponse, toOffersResponse };
