const { effectiveImage } = require('../utils/productImage');
const { computeFinalPrice } = require('../services/manufacturerDiscount.service');

// The pharmacist-facing shape of a warehouse product offer, as the Offers &
// Ads tab lists it.
//
// Prices stay USD across the boundary (`*Usd`), like every other product price
// in this API - the Flutter client converts to SYP for display through its one
// existing currency formatter (core/utils/currency_formatter.dart).
//
// `discountPriceUsd` is computed by the very function the catalog listing uses
// (product.viewmodel.js -> computeDiscountedPriceUsd), with the same inputs, so
// the price shown here and the price shown on the catalog card for the same
// product are the same number by construction. Nothing new is calculated here.
//
// Catalog overhaul Phase 7 (additive): `finalPriceSyp` - the lira price an
// order charges, from the order's own function at `priceRate` - plus the two
// discount percentages, exactly as the catalog product carries them.
function serializeActiveOffer({ offer, product, warehouse, manufacturerDiscountPercentage }, usdToSyp = null) {
  const price = computeFinalPrice({
    priceUsd: product.price,
    offerDiscountPercentage: offer.discountPercentage,
    manufacturerDiscountPercentage,
    usdToSyp,
  });
  return {
    id: offer._id,
    titleAr: offer.titleAr,
    titleEn: offer.titleEn,
    // 'bonus': same price, a better bonus - `bonuses` is the offer's, and
    // `regularBonuses` the product's usual one it improves on.
    offerType: offer.offerType || 'discount',
    discountPercentage: offer.discountPercentage,
    bonuses: (offer.bonuses ?? []).map((tier) => ({ buy: tier.buy, free: tier.free })),
    regularBonuses: (product.bonuses ?? []).map((tier) => ({ buy: tier.buy, free: tier.free })),
    startDate: offer.startDate,
    // null on a permanent offer - `isPermanent` is what the client checks, so
    // it never has to infer "no expiry" from a missing date.
    endDate: offer.endDate,
    isPermanent: Boolean(offer.isPermanent),
    warehouseId: offer.warehouseId,
    warehouseNameAr: warehouse.nameAr,
    warehouseNameEn: warehouse.nameEn,
    // The offer's product, flattened onto the offer: a card shows one product,
    // and a nested object would buy nothing.
    productId: product._id,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    // The client navigates into the existing warehouse -> manufacturer ->
    // catalog flow with this, exactly as a tapped banner does.
    manufacturerAr: product.manufacturerAr,
    manufacturerEn: product.manufacturerEn,
    image: effectiveImage(product),
    unitAr: product.unitAr,
    unitEn: product.unitEn,
    priceUsd: product.price,
    discountPriceUsd: price.finalUsd,
    isAvailable: product.isAvailable,
    finalPriceSyp: price.finalSyp,
    priceRate: usdToSyp > 0 ? usdToSyp : null,
    offerDiscountPercentage: offer.discountPercentage,
    manufacturerDiscountPercentage: manufacturerDiscountPercentage ?? null,
  };
}

function toActiveOffersResponse(rows, usdToSyp = null) {
  return { offers: rows.map((row) => serializeActiveOffer(row, usdToSyp)), priceRate: usdToSyp > 0 ? usdToSyp : null };
}

module.exports = { toActiveOffersResponse };
