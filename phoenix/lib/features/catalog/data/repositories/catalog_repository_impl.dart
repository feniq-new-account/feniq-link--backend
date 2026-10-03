import 'package:dio/dio.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/catalog/data/models/category_model.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';

import 'catalog_repository.dart';

class CatalogRepositoryImpl implements CatalogRepository, SessionScoped {
  CatalogRepositoryImpl({required ApiClient apiClient, SessionScope? sessionScope}) : _apiClient = apiClient {
    sessionScope?.register(this);
  }

  final ApiClient _apiClient;

  // Catalog overhaul Phase 11 (L4): the categories are read once per sign-in
  // and reused on every catalog open, instead of refetched each time. Two
  // opens racing share the one request; a failed read is not cached, so the
  // next open simply tries again.
  List<CategoryModel>? _categories;
  Future<List<CategoryModel>>? _categoriesRequest;

  @override
  Future<List<CategoryModel>> getCategories() {
    final cached = _categories;
    if (cached != null) return Future.value(cached);
    return _categoriesRequest ??= _fetchCategories().then(
      (categories) {
        _categories = categories;
        _categoriesRequest = null;
        return categories;
      },
      onError: (Object error, StackTrace stackTrace) {
        _categoriesRequest = null;
        Error.throwWithStackTrace(error, stackTrace);
      },
    );
  }

  Future<List<CategoryModel>> _fetchCategories() async {
    try {
      final response = await _apiClient.dio.get(Endpoints.categories);
      final data = response.data as Map<String, dynamic>;
      final categories = (data['categories'] as List).cast<Map<String, dynamic>>();
      return categories.map(CategoryModel.fromJson).toList();
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  // The next account reads the categories fresh.
  @override
  void resetForSignOut() {
    _categories = null;
    _categoriesRequest = null;
  }

  @override
  Future<PaginatedResult<ProductModel>> getProducts({
    required String warehouseId,
    String? search,
    String? categoryId,
    String? manufacturer,
    int? limit,
    String? after,
  }) async {
    try {
      final response = await _apiClient.dio.get(
        Endpoints.warehouseProducts(warehouseId),
        queryParameters: {
          if (search != null && search.isNotEmpty) 'search': search,
          if (categoryId != null) 'categoryId': categoryId,
          if (manufacturer != null) 'manufacturer': manufacturer,
          if (limit != null) 'limit': limit,
          if (after != null) 'after': after,
        },
      );
      final data = response.data as Map<String, dynamic>;
      return PaginatedResult.fromJsonSkippingInvalid(data, 'products', ProductModel.tryFromJson);
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<List<ProductModel>> getAlternatives({required String warehouseId, required String productId}) async {
    try {
      final response = await _apiClient.dio.get(Endpoints.productAlternatives(warehouseId, productId));
      final data = response.data as Map<String, dynamic>;
      return PaginatedResult.fromJsonSkippingInvalid(data, 'products', ProductModel.tryFromJson).items;
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<List<ManufacturerModel>> getManufacturers({required String warehouseId}) async {
    try {
      final response = await _apiClient.dio.get(Endpoints.warehouseManufacturers(warehouseId));
      final data = response.data as Map<String, dynamic>;
      return (data['manufacturers'] as List).map(ManufacturerModel.fromJson).toList();
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }
}
