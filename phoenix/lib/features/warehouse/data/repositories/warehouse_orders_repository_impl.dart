import 'package:dio/dio.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';

import 'warehouse_orders_repository.dart';

class WarehouseOrdersRepositoryImpl implements WarehouseOrdersRepository {
  WarehouseOrdersRepositoryImpl({required ApiClient apiClient})
    : _apiClient = apiClient;

  final ApiClient _apiClient;

  @override
  Future<WarehouseOrdersPage> getOrders({String? status, String? after}) async {
    try {
      final response = await _apiClient.dio.get(
        Endpoints.warehouseOrders,
        queryParameters: {'status': ?status, 'after': ?after},
      );
      return WarehouseOrdersPage.fromJson(
        response.data as Map<String, dynamic>,
      );
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<WarehouseOrderDetail> getOrder(String orderId) async {
    try {
      final response = await _apiClient.dio.get(
        Endpoints.warehouseOrder(orderId),
      );
      return WarehouseOrderDetail.fromJson(
        response.data as Map<String, dynamic>,
      );
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<AdvancedOrderStatus> advance(
    String orderId, {
    String? expectedStatus,
    String? targetStatus,
  }) async {
    try {
      final response = await _apiClient.dio.post(
        Endpoints.warehouseOrderAdvance(orderId),
        data: {
          if (expectedStatus != null) 'expectedStatus': expectedStatus,
          if (targetStatus != null) 'targetStatus': targetStatus,
        },
      );
      return AdvancedOrderStatus.fromJson(
        response.data as Map<String, dynamic>,
      );
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<WarehouseOrderDetail> updateItems(
    String orderId, {
    Map<String, int> quantities = const {},
    List<String> removals = const [],
    Map<String, int> additions = const {},
  }) async {
    try {
      final response = await _apiClient.dio.patch(
        Endpoints.warehouseOrderItems(orderId),
        data: {
          'updateItems': [
            for (final entry in quantities.entries)
              {'orderItemId': entry.key, 'quantity': entry.value},
          ],
          'removeItems': removals,
          if (additions.isNotEmpty)
            'addItems': [
              for (final entry in additions.entries)
                {'productId': entry.key, 'quantity': entry.value},
            ],
        },
      );
      return WarehouseOrderDetail.fromJson(
        response.data as Map<String, dynamic>,
      );
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<List<WarehouseProductHit>> searchProducts(String query) async {
    try {
      final response = await _apiClient.dio.get(
        Endpoints.warehouseProductSearch,
        queryParameters: {
          if (query.trim().isNotEmpty) 'search': query.trim(),
          'available': 'true',
          'limit': 20,
        },
      );
      return WarehouseProductHit.listFromJson(
        response.data as Map<String, dynamic>,
      );
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }
}
