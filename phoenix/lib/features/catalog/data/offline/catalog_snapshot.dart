import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/core/offline/medicine_keys.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';

/// A warehouse's whole catalog as it was the last time the phone downloaded it:
/// every product exactly as the server sent it, and the company list.
///
/// With no connection the repository answers from this instead of the server -
/// the same pages, the same search (name, company, active ingredient), the same
/// alternatives - so the screens cannot tell the difference. The prices and
/// availability are those of [savedAt], which the app says out loud (the
/// OfflineBanner); an order itself always goes to the server.
class CatalogSnapshot {
  CatalogSnapshot({
    required this.warehouseId,
    required this.savedAt,
    required this.products,
    required this.manufacturers,
  });

  final String warehouseId;
  final DateTime savedAt;

  /// The `products` rows of the server's list endpoint, in its order (by id).
  final List<Map<String, dynamic>> products;

  /// The `manufacturers` rows of the server's company list.
  final List<Object?> manufacturers;

  /// The most a page may hold - the server refuses more as well.
  static const int maxPageSize = 100;
  static const int alternativesLimit = 20;

  late final List<_Row> _rows = products.map(_Row.new).toList();

  Map<String, Object?> toJson() => {
    'warehouseId': warehouseId,
    'products': products,
    'manufacturers': manufacturers,
  };

  static CatalogSnapshot? fromEntry(String warehouseId, DateTime savedAt, Object? data) {
    if (data is! Map) return null;
    final products = data['products'];
    final manufacturers = data['manufacturers'];
    if (products is! List || manufacturers is! List) return null;
    return CatalogSnapshot(
      warehouseId: warehouseId,
      savedAt: savedAt,
      products: products.whereType<Map<String, dynamic>>().toList(),
      manufacturers: manufacturers,
    );
  }

  List<ManufacturerModel> listManufacturers() {
    final result = <ManufacturerModel>[];
    for (final raw in manufacturers) {
      try {
        result.add(ManufacturerModel.fromJson(raw));
      } catch (_) {
        // A damaged row is left out; the rest still lists.
      }
    }
    return result;
  }

  /// One page of products - the same filters the server applies: an exact
  /// company, a category, and a search over the medicine's name, its company
  /// and its active ingredient. Paged by the id of the last row, like the server.
  PaginatedResult<ProductModel> query({
    String? search,
    String? categoryId,
    String? manufacturer,
    int limit = 20,
    String? after,
  }) {
    final pageSize = limit < 1 ? 1 : (limit > maxPageSize ? maxPageSize : limit);
    final term = normalizeText(search);
    final company = normalizeText(manufacturer);

    final matches = <_Row>[];
    for (final row in _rows) {
      if (categoryId != null && categoryId.isNotEmpty && row.categoryId != categoryId) continue;
      if (company.isNotEmpty && row.manufacturerKey != company) continue;
      if (term.isNotEmpty && !row.matches(term)) continue;
      matches.add(row);
    }

    var start = 0;
    if (after != null) {
      final index = matches.indexWhere((row) => row.id == after);
      if (index >= 0) start = index + 1;
    }
    final end = start + pageSize < matches.length ? start + pageSize : matches.length;
    final page = matches.sublist(start, end);

    final items = <ProductModel>[];
    for (final row in page) {
      final product = ProductModel.tryFromJson(row.json);
      if (product != null) items.add(product);
    }
    final hasMore = end < matches.length;
    return PaginatedResult(items: items, hasMore: hasMore, nextCursor: page.isEmpty ? null : page.last.id);
  }

  /// The other products with the same active ingredient, strength and kind of
  /// form - available ones first, then the cheapest - as the server would say.
  List<ProductModel> alternativesOf(String productId) {
    _Row? source;
    for (final row in _rows) {
      if (row.id == productId) {
        source = row;
        break;
      }
    }
    if (source == null) return const [];
    final ingredient = source.ingredientKey;
    final strength = source.strengthKey;
    final form = source.formKey;
    if (ingredient.isEmpty || strength == null || form == null) return const [];

    final candidates = _rows
        .where(
          (row) =>
              row.id != productId &&
              row.ingredientKey == ingredient &&
              row.strengthKey == strength &&
              row.formKey == form,
        )
        .toList();
    candidates.sort((a, b) {
      if (a.isAvailable != b.isAvailable) return a.isAvailable ? -1 : 1;
      return a.priceUsd.compareTo(b.priceUsd);
    });

    final items = <ProductModel>[];
    for (final row in candidates.take(alternativesLimit)) {
      final product = ProductModel.tryFromJson(row.json);
      if (product != null) items.add(product);
    }
    return items;
  }
}

/// One product plus the folded copies of its names the searches compare.
class _Row {
  _Row(this.json)
    : id = json['id'] as String? ?? '',
      categoryId = json['categoryId'] as String?,
      nameKey = normalizeText(json['nameAr'] as String?),
      nameEnKey = normalizeText(json['nameEn'] as String?),
      manufacturerKey = normalizeText(json['manufacturerAr'] as String?),
      manufacturerEnKey = normalizeText(json['manufacturerEn'] as String?),
      ingredientKey = normalizeText(json['activeIngredient'] as String?),
      isAvailable = json['isAvailable'] as bool? ?? true,
      priceUsd = (json['priceUsd'] as num?) ?? 0;

  final Map<String, dynamic> json;
  final String id;
  final String? categoryId;
  final String nameKey;
  final String nameEnKey;
  final String manufacturerKey;
  final String manufacturerEnKey;
  final String ingredientKey;
  final bool isAvailable;
  final num priceUsd;

  late final String? strengthKey = strengthKeyOf(json['strength'] as String?);
  late final String? formKey = formKeyOf(json['dosageForm'] as String?);

  /// The ingredient is only searched from three letters on, so a vague
  /// two-letter query does not turn up half the catalog - as on the server.
  bool matches(String term) =>
      nameKey.contains(term) ||
      nameEnKey.contains(term) ||
      manufacturerKey.contains(term) ||
      manufacturerEnKey.contains(term) ||
      (term.length >= 3 && ingredientKey.contains(term));
}
