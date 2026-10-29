import 'package:feniq/features/warehouse/data/models/warehouse_insights_models.dart';
import 'package:feniq/core/services/pending_payment_journal.dart';
import 'package:dio/dio.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';

import 'warehouse_management_repository.dart';

class WarehouseManagementRepositoryImpl implements WarehouseManagementRepository {
  WarehouseManagementRepositoryImpl({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;
  final PendingPaymentJournal _payments = PendingPaymentJournal();

  Future<Map<String, dynamic>> _run(Future<Response<dynamic>> Function(Dio dio) call) async {
    try {
      final response = await call(_apiClient.dio);
      final data = response.data;
      return data is Map<String, dynamic> ? data : const {};
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<Map<String, bool>> getInsightAccess() async {
    final data = await _run((dio) => dio.get('/warehouse/subscription'));
    if (data['features'] is! Map) throw ServerFailure('Incomplete subscription response.', code: FailureCode.unexpected);
    final flags = (data['features'] as Map?) ?? const {};
    return {for (final entry in flags.entries) entry.key.toString(): entry.value == true};
  }
  @override
  Future<WarehouseInsightsReport> getInsights({String period = 'month', bool force = false}) async {
    final data = await _run((dio) => dio.get('/warehouse/insights/report', queryParameters: {'period': period, if (force) 'force': '1'}));
    if (data['totals'] is! Map || data['daily'] is! List || data['aging'] is! Map || data['asOfBusiness'] is! String) {
      throw ServerFailure('Incomplete report response.', code: FailureCode.unexpected);
    }
    return WarehouseInsightsReport.fromJson(data);
  }
  @override
  Future<WarehouseFollowUpPage> getFollowUp({required String kind, String? after, bool force = false}) async {
    final data = await _run((dio) => dio.get('/warehouse/insights/follow-up', queryParameters: {
      'kind': kind, if (after != null) 'after': after, if (force) 'force': '1'}));
    if (data['rows'] is! List || data['pagination'] is! Map || data['asOfBusiness'] is! String) {
      throw ServerFailure('Incomplete follow-up response.', code: FailureCode.unexpected);
    }
    return WarehouseFollowUpPage.fromJson(data);
  }
  @override
  Future<FollowUpSettings> updateFollowUp(FollowUpSettings settings) async =>
    FollowUpSettings.fromJson((await _run((dio) => dio.put('/warehouse/insights/settings', data: settings.toJson())))['settings']);
  @override
  Future<WarehouseAlertsData> getInsightAlerts() async {
    final data = await _run((dio) => dio.get('/warehouse/insights/alerts'));
    if (data['alerts'] is! List || data['asOfBusiness'] is! String) {
      throw ServerFailure('Incomplete alerts response.', code: FailureCode.unexpected);
    }
    return WarehouseAlertsData.fromJson(data);
  }

  WarehouseRep _rep(Map<String, dynamic> data) =>
      WarehouseRep.fromJson((data['rep'] as Map?)?.cast<String, dynamic>() ?? const {});

  @override
  Future<List<WarehouseRep>> getReps() async {
    final data = await _run((dio) => dio.get(Endpoints.warehouseReps));
    return ((data['reps'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => WarehouseRep.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  @override
  Future<WarehouseRep> createRep({
    required String name,
    required String phone,
    required String password,
    required double commissionRate,
    bool warehouseShareToRep = false,
  }) async {
    final data = await _run(
      (dio) => dio.post(
        Endpoints.warehouseReps,
        data: {
          'name': name,
          'phone': phone,
          'password': password,
          'commissionRate': commissionRate,
          'warehouseShareToRep': warehouseShareToRep,
        },
      ),
    );
    return _rep(data);
  }

  @override
  Future<WarehouseRep> updateRep(
    String repId, {
    double? commissionRate,
    bool? isActive,
    bool? warehouseShareToRep,
  }) async {
    final data = await _run(
      (dio) => dio.patch(
        Endpoints.warehouseRep(repId),
        data: {'commissionRate': ?commissionRate, 'isActive': ?isActive, 'warehouseShareToRep': ?warehouseShareToRep},
      ),
    );
    return _rep(data);
  }

  @override
  Future<void> resetRepPassword(String repId, String password) async {
    await _run((dio) => dio.post(Endpoints.warehouseRepResetPassword(repId), data: {'password': password}));
  }

  @override
  Future<List<RepAssignedPharmacy>> getRepPharmacies(String repId) async {
    final data = await _run((dio) => dio.get(Endpoints.warehouseRepPharmacies(repId)));
    return ((data['pharmacies'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => RepAssignedPharmacy.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  @override
  Future<WarehouseRepVisitsPage> getRepVisits({String? repId, String? after}) async {
    final data = await _run(
      (dio) => dio.get(Endpoints.warehouseRepVisits, queryParameters: {'repId': ?repId, 'after': ?after}),
    );
    return WarehouseRepVisitsPage.fromJson(data);
  }

  @override
  Future<WarehouseAccountsPage> getAccounts({String? search, String? after}) async {
    final text = search?.trim();
    final data = await _run(
      (dio) => dio.get(
        Endpoints.warehouseBalances,
        queryParameters: {if (text != null && text.isNotEmpty) 'search': text, 'after': ?after},
      ),
    );
    return WarehouseAccountsPage.fromJson(data);
  }

  @override
  Future<WarehouseStatement> getStatement(String pharmacyId) async {
    final data = await _run((dio) => dio.get(Endpoints.warehouseBalance(pharmacyId)));
    return WarehouseStatement.fromJson(data);
  }

  @override
  Future<WarehouseSummary> getSummary({String period = 'today'}) async {
    final data = await _run((dio) => dio.get(Endpoints.warehouseBalancesSummary, queryParameters: {'period': period}));
    return WarehouseSummary.fromJson(data);
  }

  @override
  Future<void> recordPayment({
    required String pharmacyId,
    required double amountSyp,
    required String method,
    required String idempotencyKey,
    String? note,
    String? deliveryOrderId,
  }) async {
    final text = note?.trim();
    final ownerId = await _apiClient.currentAccountId();
    if (ownerId == null) throw ServerFailure('Session expired', code: 'HTTP_401');
    final payload = <String, Object?>{
      if (deliveryOrderId != null) 'deliveryOrderId': deliveryOrderId,
      'pharmacyId': pharmacyId,
      'amount': amountSyp,
      'currency': 'SYP',
      'method': method,
      if (text != null && text.isNotEmpty) 'note': text,
    };
    try {
      await _payments.run(
        ownerId: ownerId,
        payload: payload,
        proposedKey: idempotencyKey,
        send: (key) async {
          if (await _apiClient.currentAccountId() != ownerId) {
            throw ServerFailure('Session changed. Sign in to the original account to resume.', code: 'HTTP_401');
          }
          if (deliveryOrderId != null) {
            await _run(
              (dio) => dio.post(
                Endpoints.warehouseOrderAdvance(deliveryOrderId),
                data: {'expectedStatus': 'out_for_delivery', 'targetStatus': 'delivered'},
              ),
            );
          }
          final payment = {...payload, 'idempotencyKey': key}..remove('deliveryOrderId');
          await _run((dio) => dio.post(Endpoints.warehousePayments, data: payment));
        },
      );
    } on Failure {
      rethrow;
    } catch (_) {
      throw ServerFailure('Payment could not be confirmed. Retry the same payment.', code: 'PAYMENT_UNCONFIRMED');
    }
  }

  @override
  Future<List<PendingPaymentRecord>> getPendingPayments() async {
    final ownerId = await _apiClient.currentAccountId();
    return ownerId == null ? [] : _payments.read(ownerId);
  }

  @override
  Future<WarehouseLoyalty> getLoyalty() async =>
      WarehouseLoyalty.fromSettingsJson(await _run((dio) => dio.get(Endpoints.warehouseSettings)));

  @override
  Future<WarehouseLoyalty> updateLoyalty({
    required bool enabled,
    required List<LoyaltyTier> tiers,
    String mode = 'per_order',
    int? revision,
  }) async => WarehouseLoyalty.fromSettingsJson(
    await _run(
      (dio) => dio.put(
        Endpoints.warehouseLoyalty,
        data: {
          'enabled': enabled,
          'mode': mode,
          if (revision != null) 'revision': revision,
          'tiers': [for (final tier in tiers) tier.toJson()],
        },
      ),
    ),
  );

  @override
  Future<WarehouseReturnsPage> getReturns({String? status, String? after}) async {
    final data = await _run(
      (dio) => dio.get(
        Endpoints.warehouseReturns,
        // `limit` is what opts the endpoint into paging.
        queryParameters: {'limit': 15, 'status': ?status, 'after': ?after},
      ),
    );
    return WarehouseReturnsPage.fromJson(data);
  }

  @override
  Future<WarehouseReturn> getReturn(String returnId) async {
    final data = await _run((dio) => dio.get(Endpoints.warehouseReturn(returnId)));
    return WarehouseReturn.fromJson(data);
  }

  @override
  Future<double?> previewReturnCredit(String returnId) async {
    final data = await _run((dio) => dio.get(Endpoints.warehouseReturnPreview(returnId)));
    final preview = data['preview'];
    final credit = preview is Map ? preview['creditSyp'] : null;
    return credit is num ? credit.toDouble() : null;
  }

  // The resolve endpoints answer with the return's new status only.
  WarehouseReturn _resolved(Map<String, dynamic> data) => WarehouseReturn.fromJson(data);

  @override
  Future<WarehouseReturn> approveReturn(String returnId) async =>
      _resolved(await _run((dio) => dio.post(Endpoints.warehouseReturnApprove(returnId))));

  @override
  Future<WarehouseReturn> rejectReturn(String returnId, String note) async => _resolved(
    await _run((dio) => dio.post(Endpoints.warehouseReturnReject(returnId), data: {'rejectionNote': note})),
  );
}
