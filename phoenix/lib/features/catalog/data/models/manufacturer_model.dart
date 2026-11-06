import 'package:feniq/core/utils/display_name.dart';
// The pharmacist's entry into a warehouse's catalog: one distinct
// manufacturer (its Arabic name - also the exact string the catalog filters
// on) paired with the warehouse's standing discount for that manufacturer,
// so the company card can show it. See the backend's
// listManufacturersWithDiscountsForWarehouse - the discount here is
// display-only, every price the app renders stays server-computed.
class ManufacturerModel {
  const ManufacturerModel({required this.name, this.discountPercentage = 0, this.id, this.nameEn, this.logoUrl});

  // The manufacturer's Arabic name - the value CatalogView filters the
  // medicine list on.
  final String name;
  // Warehouse-set, always-on discount for this manufacturer's products, as a
  // percentage. Zero when the warehouse has no discount configured;
  // the card hides this detail unless it is positive.
  final num discountPercentage;
  // The central manufacturer's id - null for an older backend, and for a
  // legacy product's free-text company that matches no manufacturer. Only
  // used to pick the placeholder avatar's colour.
  final String? id;
  final String? nameEn;

  /// The company shown: English when there is one (see englishFirst).
  String get displayName => englishFirst(nameEn, name);
  // The company's logo (set by the admin). Null means the card draws the
  // first letter of the name in a coloured circle instead.
  final String? logoUrl;

  // Accepts either the enriched object shape or a bare name string (an older
  // backend, or mid-rollout) - a plain string just carries no discount info,
  // i.e. 0. Every field beyond manufacturerAr is optional.
  factory ManufacturerModel.fromJson(Object? json) {
    if (json is String) return ManufacturerModel(name: json);
    final map = json as Map<String, dynamic>;
    return ManufacturerModel(
      name: map['manufacturerAr'] as String,
      discountPercentage: (map['discountPercentage'] as num?) ?? 0,
      id: map['manufacturerId'] as String?,
      nameEn: map['manufacturerEn'] as String?,
      logoUrl: map['logoUrl'] as String?,
    );
  }
}
