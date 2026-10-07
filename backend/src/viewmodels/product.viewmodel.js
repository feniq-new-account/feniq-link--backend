const { effectiveImage } = require('../utils/productImage');
const { computeFinalPrice } = require('../services/manufacturerDiscount.service');
const { effectiveBonuses } = require('../utils/bonus');

// Section 15: `discountPriceUsd` is the one number the Flutter catalog
// renders - it already has the manufacturer discount (if any) stacked with an
// active product-level Offer (if any), so the client just compares it against
// `priceUsd` rather than juggling two separate discount mechanisms. `offer` is
// kept alongside for whatever still wants the raw Offer details (title, its
// own percentage).
//
// Catalog overhaul Phase 7 - all additive, older app builds ignore them:
//  - `finalPriceSyp` is the lira price the order will charge for one unit,
//    computed by the order's own function (computeFinalPrice) at `priceRate`,
//    the USD/SYP rate this response was priced at. Flutter shows this figure
//    rather than converting discountPriceUsd itself, and sends `priceRate` back
//    as the order's rateUsed. Null when no rate is configured.
//  - `offerDiscountPercentage` / `manufacturerDiscountPercentage`: the two
//    inputs, so the app can re-price the same way should the rate move.
//  - `unit` (config/units.js code) and `bonuses` ([{ buy, free }]).
function serializeProductWithOffer({ product, offer, manufacturerDiscountPercentage }, usdToSyp = null) {
  const price = computeFinalPrice({
    priceUsd: product.price,
    offerDiscountPercentage: offer ? offer.discountPercentage : null,
    manufacturerDiscountPercentage,
    usdToSyp,
  });
  const base = {
    id: product._id,
    categoryId: product.categoryId,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    manufacturerAr: product.manufacturerAr,
    manufacturerEn: product.manufacturerEn,
    image: effectiveImage(product),
    // Additive: what the medicine is made of and how strong, for the app to show under the name.
    activeIngredient: product.activeIngredient ?? null,
    strength: product.strength ?? null,
    // The dosage form, so the app can find alternatives on its own when it is offline.
    dosageForm: product.dosageForm ?? null,
    unitAr: product.unitAr,
    unitEn: product.unitEn,
    priceUsd: product.price,
    discountPriceUsd: price.finalUsd,
    isAvailable: product.isAvailable,
    offer: null,
    finalPriceSyp: price.finalSyp,
    priceRate: usdToSyp > 0 ? usdToSyp : null,
    offerDiscountPercentage: offer ? offer.discountPercentage : null,
    manufacturerDiscountPercentage: manufacturerDiscountPercentage ?? null,
    unit: product.unit ?? null,
    productionDate: product.productionDate ? new Date(product.productionDate).toISOString().slice(0, 10) : null,
    expiryDate: product.expiryDate ? new Date(product.expiryDate).toISOString().slice(0, 10) : null,
    // The bonus in force: a running bonus offer's tiers, else the product's
    // own. `regularBonuses` is the product's own, so a card can show
    // "10+3 instead of 10+2" while a bonus offer runs.
    bonuses: effectiveBonuses(product, offer),
    regularBonuses: (product.bonuses ?? []).map((tier) => ({ buy: tier.buy, free: tier.free })),
  };

  if (offer) {
    base.offer = {
      titleAr: offer.titleAr,
      titleEn: offer.titleEn,
      offerType: offer.offerType || 'discount',
      bonuses: (offer.bonuses ?? []).map((tier) => ({ buy: tier.buy, free: tier.free })),
      discountPercentage: offer.discountPercentage,
      discountPriceUsd: Math.round(product.price * (1 - offer.discountPercentage / 100) * 100) / 100,
    };
  }

  return base;
}

function toProductListResponse(items, usdToSyp = null) {
  return { products: items.map((item) => serializeProductWithOffer(item, usdToSyp)), priceRate: usdToSyp > 0 ? usdToSyp : null };
}

// One medicine at another warehouse: the product exactly as the catalog shows
// it, and the warehouse it is at (the card fields the app needs to go there).
function toElsewhereResponse(entries, usdToSyp = null) {
  return {
    alternatives: entries.map(({ warehouse, isSameMedicine, ...item }) => ({
      warehouse: {
        id: warehouse._id,
        nameAr: warehouse.nameAr,
        nameEn: warehouse.nameEn ?? null,
        city: warehouse.city ?? null,
        logo: warehouse.logo ?? null,
      },
      isSameMedicine: Boolean(isSameMedicine),
      product: serializeProductWithOffer(item, usdToSyp),
    })),
    priceRate: usdToSyp > 0 ? usdToSyp : null,
  };
}

// serializeProductWithOffer is exported so the reorder endpoint
// (order.viewmodel.js) can emit the exact same product shape the catalog
// browse does - one serializer, so the cart parses both identically.
module.exports = { toProductListResponse, toElsewhereResponse, serializeProductWithOffer };
