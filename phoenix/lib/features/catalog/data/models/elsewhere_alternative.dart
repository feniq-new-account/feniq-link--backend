import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';

// The medicine (or one that stands in for it: same ingredient, strength and
// form) on sale at another warehouse, with that warehouse - what the
// alternatives sheet offers when this warehouse can't help, so the pharmacist
// can go there. See product.service.js's listAlternativesElsewhere.
class ElsewhereAlternative {
  const ElsewhereAlternative({
    required this.warehouseId,
    required this.warehouseNameAr,
    this.warehouseNameEn,
    this.warehouseCity,
    this.warehouseLogo,
    required this.isSameMedicine,
    required this.product,
  });

  final String warehouseId;
  final String warehouseNameAr;
  final String? warehouseNameEn;
  final String? warehouseCity;
  final String? warehouseLogo;
  // The very medicine the pharmacist asked about, not a substitute.
  final bool isSameMedicine;
  final ProductModel product;

  String get warehouseName => englishFirst(warehouseNameEn, warehouseNameAr);

  // A malformed entry is left out rather than failing the whole list.
  static ElsewhereAlternative? tryFromJson(Map<String, dynamic> json) {
    final warehouse = json['warehouse'];
    final productJson = json['product'];
    if (warehouse is! Map<String, dynamic> || productJson is! Map<String, dynamic>) return null;
    final id = warehouse['id'];
    if (id is! String || id.isEmpty) return null;
    final product = ProductModel.tryFromJson(productJson);
    if (product == null) return null;
    return ElsewhereAlternative(
      warehouseId: id,
      warehouseNameAr: (warehouse['nameAr'] as String?) ?? '',
      warehouseNameEn: warehouse['nameEn'] as String?,
      warehouseCity: warehouse['city'] as String?,
      warehouseLogo: warehouse['logo'] as String?,
      isSameMedicine: json['isSameMedicine'] == true,
      product: product,
    );
  }
}
