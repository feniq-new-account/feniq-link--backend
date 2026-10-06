import 'package:feniq/core/utils/display_name.dart';
// A snapshotted invoice line - name/manufacturer/price exactly as they were
// at order time (see orderItem.model.js on the backend), not a live product
// lookup. Only present on the detail fetch (GET /orders/:id).
class OrderLineItem {
  const OrderLineItem({
    required this.id,
    required this.productId,
    required this.productNameAr,
    this.productNameEn,
    required this.manufacturerAr,
    this.manufacturerEn,
    required this.quantity,
    required this.unitPrice,
    required this.discountPrice,
    required this.lineTotal,
    this.savingsUsd,
    this.freeQuantity = 0,
  });

  // The underlying OrderItem's own id - what a return request references
  // (see features/returns), distinct from productId.
  final String id;
  final String productId;
  final String productNameAr;
  // Section 14 Part 2: null when the linked catalog entry had no English
  // name at order time - see orderItem.model.js. Fall back to the Arabic
  // value when displaying, never render blank.
  final String? productNameEn;
  final String manufacturerAr;
  final String? manufacturerEn;

  /// The medicine shown: English when there is one (see englishFirst).
  String get displayName => englishFirst(productNameEn, productNameAr);

  /// The company shown: English when there is one (see englishFirst).
  String get displayManufacturer => englishFirst(manufacturerEn, manufacturerAr);
  final int quantity;
  final num unitPrice;
  final num discountPrice;
  final num lineTotal;
  // Section 15: USD, not SYP (deliberately, unlike the price fields above) -
  // how much this line saved vs. its undiscounted unitPrice, from any
  // stacked product Offer + manufacturer discount combined. Null/0 for an
  // order placed before Section 15, or a line nothing discounted - either
  // way, no "you saved" line to show.
  final num? savingsUsd;
  // Free bonus units delivered on top of [quantity] and never charged
  // (catalog overhaul Phase 8). 0 on an older order or backend.
  final int freeQuantity;

  bool get hasOffer => discountPrice != unitPrice;

  factory OrderLineItem.fromJson(Map<String, dynamic> json) => OrderLineItem(
    id: json['id'] as String,
    productId: json['productId'] as String,
    productNameAr: (json['productNameAr'] as String?) ?? '',
    productNameEn: json['productNameEn'] as String?,
    manufacturerAr: (json['manufacturerAr'] as String?) ?? '',
    manufacturerEn: json['manufacturerEn'] as String?,
    quantity: json['quantity'] as int,
    unitPrice: json['unitPrice'] as num,
    discountPrice: json['discountPrice'] as num,
    lineTotal: json['lineTotal'] as num,
    savingsUsd: json['savingsUsd'] as num?,
    freeQuantity: (json['freeQuantity'] as num?)?.toInt() ?? 0,
  );
}
