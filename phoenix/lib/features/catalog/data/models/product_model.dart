import 'package:flutter/foundation.dart';
import 'package:feniq/core/utils/pricing.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';

class ProductModel {
  const ProductModel({
    required this.id,
    this.categoryId,
    required this.nameAr,
    this.nameEn,
    required this.manufacturerAr,
    this.manufacturerEn,
    this.image,
    this.activeIngredient,
    this.strength,
    this.unitAr,
    this.unitEn,
    required this.priceUsd,
    required this.discountPriceUsd,
    required this.isAvailable,
    required this.hasActiveOffer,
    this.finalPriceSyp,
    this.priceRate,
    this.offerDiscountPercentage,
    this.manufacturerDiscountPercentage,
    this.hasDiscountInputs = false,
    this.unit,
    this.bonuses = const [],
  });

  final String id;
  // Section 14 Part 2: null for a product bulk-imported from Excel (the
  // import format carries no category/unit columns, same reasoning as the
  // central catalog's own import) until a warehouse fills it in via edit.
  final String? categoryId;
  final String nameAr;
  // Null when the linked catalog entry has no English name set - Excel
  // import only captures Arabic (see productCatalog.service.js). Always
  // fall back to the Arabic value when displaying, never render blank.
  final String? nameEn;
  final String manufacturerAr;
  final String? manufacturerEn;
  // The effective image: the warehouse's own, else the catalog item's.
  final String? image;
  // What the medicine is made of and how strong (e.g. 'PARACETAMOL', '500 MG/TAB.').
  // Null when the catalog item has none - then there are no alternatives to offer either.
  final String? activeIngredient;
  final String? strength;
  final String? unitAr;
  final String? unitEn;
  // USD, not SYP - see backend/src/models/product.model.js. SYP is what the
  // server computes for display (finalPriceSyp below), except in order/invoice
  // history which stays SYP-native (locked in at order time).
  final num priceUsd;
  // Section 15: priceUsd with any active product Offer AND the warehouse's
  // manufacturer discount already stacked in (server-computed, see
  // product.viewmodel.js) - equal to priceUsd when neither applies.
  final num discountPriceUsd;
  final bool isAvailable;
  // Whether this product has an active product-level Offer right now (see
  // product.viewmodel.js's `offer` field). Distinguishes an offer's
  // before/after price display from a manufacturer-discount-only price, which
  // shows as a single plain number.
  final bool hasActiveOffer;

  // Catalog overhaul Phase 7 (all optional - an older backend sends none):
  // the lira price the order will charge for one unit, computed by the
  // server's own pricing at [priceRate]; plus the two discount inputs, so the
  // app can recompute the same figure exactly if the rate moves.
  final num? finalPriceSyp;
  final num? priceRate;
  final num? offerDiscountPercentage;
  final num? manufacturerDiscountPercentage;
  final bool hasDiscountInputs;

  // Catalog overhaul: the fixed unit code (backend config/units.js), and the
  // warehouse's bonus tiers ("بونص 10+1").
  final String? unit;
  final List<BonusTier> bonuses;

  /// The lira price of one unit at [usdToSyp] - see core/utils/pricing.dart.
  int? finalSypAt(double? usdToSyp) => displayedPriceSyp(
    priceUsd: priceUsd,
    discountPriceUsd: discountPriceUsd,
    serverPriceSyp: finalPriceSyp,
    serverRate: priceRate,
    offerPercentage: offerDiscountPercentage,
    manufacturerDiscountPercentage: manufacturerDiscountPercentage,
    hasDiscountInputs: hasDiscountInputs,
    usdToSyp: usdToSyp,
  );

  /// The undiscounted lira price of one unit at [usdToSyp] (the struck-through
  /// figure next to an offer price).
  int? unitSypAt(double? usdToSyp) =>
      usdToSyp == null || usdToSyp <= 0 ? null : (priceUsd * usdToSyp).round();

  // Tolerant of a partial row (L4): a missing name or manufacturer falls back
  // rather than throwing, so one bad product can't blank the whole page.
  // Catalog overhaul Phase 11 (L4): one malformed row (no id, no price) must
  // not take the whole catalog page down with it - it is left out and logged.
  static ProductModel? tryFromJson(Map<String, dynamic> json) {
    try {
      return ProductModel.fromJson(json);
    } catch (error) {
      debugPrint('Skipping a malformed product (${json['id']}): $error');
      return null;
    }
  }

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    // The Arabic name is the one every screen shows. The English name is kept
    // for search only and never substituted for it; a row that somehow lacks
    // an Arabic name parses with an empty one rather than failing the page.
    return ProductModel(
      id: json['id'] as String,
      categoryId: json['categoryId'] as String?,
      nameAr: (json['nameAr'] as String?) ?? '',
      nameEn: json['nameEn'] as String?,
      manufacturerAr: (json['manufacturerAr'] as String?) ?? '',
      manufacturerEn: json['manufacturerEn'] as String?,
      image: json['image'] as String?,
      activeIngredient: json['activeIngredient'] as String?,
      strength: json['strength'] as String?,
      unitAr: json['unitAr'] as String?,
      unitEn: json['unitEn'] as String?,
      priceUsd: json['priceUsd'] as num,
      discountPriceUsd: json['discountPriceUsd'] as num,
      isAvailable: json['isAvailable'] as bool,
      hasActiveOffer: json['offer'] != null,
      finalPriceSyp: json['finalPriceSyp'] as num?,
      priceRate: json['priceRate'] as num?,
      offerDiscountPercentage: json['offerDiscountPercentage'] as num?,
      manufacturerDiscountPercentage: json['manufacturerDiscountPercentage'] as num?,
      hasDiscountInputs: json.containsKey('offerDiscountPercentage') && json.containsKey('manufacturerDiscountPercentage'),
      unit: json['unit'] as String?,
      bonuses: BonusTier.listFromJson(json['bonuses']),
    );
  }
}
