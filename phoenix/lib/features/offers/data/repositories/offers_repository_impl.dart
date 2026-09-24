import 'package:dio/dio.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/features/offers/data/models/offer_model.dart';

import 'offers_repository.dart';

class OffersRepositoryImpl implements OffersRepository {
  OffersRepositoryImpl({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  @override
  Future<PaginatedResult<OfferModel>> getActiveOffers({String? cursor, int? limit}) async {
    try {
      final response = await _apiClient.dio.get(
        Endpoints.activeOffers,
        queryParameters: {if (cursor != null) 'cursor': cursor, if (limit != null) 'limit': limit},
      );
      final data = response.data as Map<String, dynamic>;
      return PaginatedResult.fromJson(data, 'offers', OfferModel.fromJson);
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }
}
