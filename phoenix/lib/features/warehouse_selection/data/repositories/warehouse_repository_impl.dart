import 'dart:async';

import 'package:dio/dio.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/core/offline/offline_status.dart';
import 'package:feniq/core/offline/offline_store.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_profile_model.dart';

import 'warehouse_repository.dart';

class WarehouseRepositoryImpl implements WarehouseRepository {
  WarehouseRepositoryImpl({required ApiClient apiClient, OfflineStore? offlineStore})
    : _apiClient = apiClient,
      _store = offlineStore;

  final ApiClient _apiClient;

  // The last list and the last profiles the server sent, kept on the phone so
  // the pharmacist can still pick a warehouse with no connection. Cleared with
  // the catalogs when the account signs out (CatalogRepositoryImpl).
  final OfflineStore? _store;

  static bool _isConnectionFailure(ServerFailure failure) =>
      failure.code == FailureCode.network || failure.code == FailureCode.timeout;

  @override
  Future<WarehouseListResult> getWarehouses({required bool onlyMyCity}) async {
    try {
      final response = await _apiClient.dio.get(
        Endpoints.warehouses,
        // Sent only when narrowing. The endpoint's own default is the
        // unfiltered list, so omitting it is both the smaller request and
        // exactly what an older app build sends.
        queryParameters: onlyMyCity ? const {'cityScope': 'mine'} : null,
      );
      final result = WarehouseListResult.fromJson(response.data as Map<String, dynamic>);
      unawaited(_store?.write(_listName(onlyMyCity), response.data) ?? Future<void>.value());
      return result;
    } on DioException catch (e) {
      final failure = ServerFailure.fromDioError(e);
      if (_isConnectionFailure(failure)) {
        final saved = await _store?.read(_listName(onlyMyCity));
        final data = saved?.data;
        if (data is Map<String, dynamic>) {
          OfflineStatus.instance.servedFromSavedCopy(saved!.savedAt);
          return WarehouseListResult.fromJson(data);
        }
      }
      throw failure;
    }
  }

  @override
  Future<WarehouseProfileModel> getWarehouseProfile(String warehouseId) async {
    try {
      final response = await _apiClient.dio.get(Endpoints.warehouseProfile(warehouseId));
      final data = response.data as Map<String, dynamic>;
      final profile = WarehouseProfileModel.fromJson(data);
      unawaited(_store?.write(_profileName(warehouseId), data) ?? Future<void>.value());
      return profile;
    } on DioException catch (e) {
      final failure = ServerFailure.fromDioError(e);
      if (_isConnectionFailure(failure)) {
        final saved = await _store?.read(_profileName(warehouseId));
        final data = saved?.data;
        if (data is Map<String, dynamic>) {
          OfflineStatus.instance.servedFromSavedCopy(saved!.savedAt);
          return WarehouseProfileModel.fromJson(data);
        }
      }
      throw failure;
    }
  }

  static String _listName(bool onlyMyCity) => onlyMyCity ? 'warehouses_mine' : 'warehouses_all';
  static String _profileName(String warehouseId) => 'warehouse_profile_$warehouseId';
}
