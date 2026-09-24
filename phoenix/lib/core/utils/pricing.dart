// The lira price of one unit, exactly as an order charges it (catalog overhaul
// Phase 7). Mirrors the backend's manufacturerDiscount.service.js
// computeFinalPrice / stackedDiscountSyp: the USD price is converted at the
// rate and rounded to the lira, then the offer and then the manufacturer
// discount are applied, rounding to the lira after each stage, never below 0.
//
// The server sends this figure with every product (`finalPriceSyp`, at
// `priceRate`), and that is what the app shows. This port is only used when
// the rate has moved since the product was fetched - it takes the discount
// percentages the server sent alongside, so the recomputed figure is still the
// one the order will charge.
int finalPriceSypAt({
  required num priceUsd,
  num? offerPercentage,
  num? manufacturerDiscountPercentage,
  required double usdToSyp,
}) {
  var price = (priceUsd * usdToSyp).round();
  if (offerPercentage != null && offerPercentage != 0) {
    price = (price * (1 - offerPercentage / 100)).round();
  }
  if (manufacturerDiscountPercentage != null && manufacturerDiscountPercentage != 0) {
    price = (price * (1 - manufacturerDiscountPercentage / 100)).round();
  }
  return price < 0 ? 0 : price;
}

// The lira figure to show for a priced line at the app's current rate:
//  - the server's own figure when it was priced at this very rate;
//  - otherwise the same computation redone at the current rate, when the
//    server sent the discount inputs (a current backend always does);
//  - otherwise (an older backend) the plain conversion of the discounted USD
//    price, as the app always did.
// Null while no rate is known.
int? displayedPriceSyp({
  required num priceUsd,
  required num discountPriceUsd,
  num? serverPriceSyp,
  num? serverRate,
  num? offerPercentage,
  num? manufacturerDiscountPercentage,
  bool hasDiscountInputs = false,
  required double? usdToSyp,
}) {
  if (usdToSyp == null || usdToSyp <= 0) return null;
  if (serverPriceSyp != null && serverRate != null && serverRate == usdToSyp) {
    return serverPriceSyp.round();
  }
  if (hasDiscountInputs) {
    return finalPriceSypAt(
      priceUsd: priceUsd,
      offerPercentage: offerPercentage,
      manufacturerDiscountPercentage: manufacturerDiscountPercentage,
      usdToSyp: usdToSyp,
    );
  }
  return (discountPriceUsd * usdToSyp).round();
}
