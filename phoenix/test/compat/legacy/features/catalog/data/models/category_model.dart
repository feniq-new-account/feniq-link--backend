// Copied unchanged from main (a0ff7cf) phoenix/lib/features/catalog/data/models/category_model.dart - the model the
// installed (old) pharmacy app parses with. Only package:feniq/ imports are
// rewritten to point at the other copies. Do not edit: see ../old_app_compat_test.dart.
class CategoryModel {
  const CategoryModel({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    this.icon,
    required this.sortOrder,
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final String? icon;
  final int sortOrder;

  factory CategoryModel.fromJson(Map<String, dynamic> json) => CategoryModel(
    id: json['id'] as String,
    nameAr: json['nameAr'] as String,
    nameEn: json['nameEn'] as String,
    icon: json['icon'] as String?,
    sortOrder: json['sortOrder'] as int? ?? 0,
  );
}
