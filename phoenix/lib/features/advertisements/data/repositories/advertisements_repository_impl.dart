import 'package:dio/dio.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/features/advertisements/data/models/advertisement_cart_preparation.dart';
import 'package:feniq/features/advertisements/data/models/advertisement_model.dart';

import 'advertisements_repository.dart';

class AdvertisementsRepositoryImpl implements AdvertisementsRepository {
  AdvertisementsRepositoryImpl({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  @override
  Future<PaginatedResult<AdvertisementModel>> getActiveAdvertisements({String? cursor, int? limit}) async {
    try {
      final response = await _apiClient.dio.get(
        Endpoints.activeAdvertisements,
        queryParameters: {if (cursor != null) 'cursor': cursor, if (limit != null) 'limit': limit},
      );
      final data = response.data as Map<String, dynamic>;
      return PaginatedResult.fromJson(data, 'advertisements', AdvertisementModel.fromJson);
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<AdvertisementCartPreparation> prepareAdvertisementCart(String advertisementId) async {
    try {
      final response = await _apiClient.dio.get(Endpoints.advertisementCart(advertisementId));
      final data = response.data as Map<String, dynamic>;
      return AdvertisementCartPreparation.fromJson(
        data['advertisementCart'] as Map<String, dynamic>,
      );
    } on DioException catch (e) {
      // Carries the server's own code through - ADVERTISEMENT_UNAVAILABLE for
      // a package that has expired, been rejected or was withdrawn between the
      // list being shown and the tap.
      throw ServerFailure.fromDioError(e);
    }
  }
}
