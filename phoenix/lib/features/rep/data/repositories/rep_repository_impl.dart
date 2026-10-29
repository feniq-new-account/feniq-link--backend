import 'package:dio/dio.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';

import 'rep_repository.dart';

class RepRepositoryImpl implements RepRepository {
  RepRepositoryImpl({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  @override
  Future<RepMe> getMe() async {
    try {
      final response = await _apiClient.dio.get(Endpoints.repMe);
      return RepMe.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<List<RepPharmacy>> getPharmacies({String? search}) async {
    try {
      final text = search?.trim() ?? '';
      final response = await _apiClient.dio.get(
        Endpoints.repPharmacies,
        queryParameters: text.isEmpty ? null : {'search': text},
      );
      final data = response.data as Map<String, dynamic>;
      return ((data['pharmacies'] as List?) ?? const [])
          .map((e) => RepPharmacy.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<RepPharmacyDetail> getPharmacy(String pharmacyId) async {
    try {
      final response = await _apiClient.dio.get(Endpoints.repPharmacy(pharmacyId));
      return RepPharmacyDetail.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<RepVisitsPage> getVisits({String? after}) async {
    try {
      final response = await _apiClient.dio.get(
        Endpoints.repVisits,
        queryParameters: after == null ? null : {'after': after},
      );
      return RepVisitsPage.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<RecordedVisit> recordVisit({
    required String code,
    required double latitude,
    required double longitude,
    required double accuracy,
    required bool isMocked,
    DateTime? capturedAt,
  }) async {
    try {
      final response = await _apiClient.dio.post(
        Endpoints.repVisits,
        data: {
          'code': code,
          'latitude': latitude,
          'longitude': longitude,
          'accuracy': accuracy,
          'isMocked': isMocked,
          'capturedAt': (capturedAt ?? DateTime.now()).toUtc().toIso8601String(),
        },
      );
      return RecordedVisit.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<VisitCode> getVisitCode() async {
    try {
      final response = await _apiClient.dio.get(Endpoints.pharmacyVisitCode);
      return VisitCode.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }
}
