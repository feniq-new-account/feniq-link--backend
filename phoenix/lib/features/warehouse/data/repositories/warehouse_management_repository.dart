import 'package:feniq/features/warehouse/data/models/warehouse_insights_models.dart';
import 'package:feniq/core/services/pending_payment_journal.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';

/// A warehouse account's reps, pharmacy accounts and returns.
abstract class WarehouseManagementRepository {
  Future<Map<String, bool>> getInsightAccess();
  Future<WarehouseInsightsReport> getInsights({String period = 'month', bool force = false});
  Future<WarehouseFollowUpPage> getFollowUp({required String kind, String? after, bool force = false});
  Future<FollowUpSettings> updateFollowUp(FollowUpSettings settings);
  Future<WarehouseAlertsData> getInsightAlerts();

  // Reps
  Future<List<WarehouseRep>> getReps();

  Future<WarehouseRep> createRep({
    required String name,
    required String phone,
    required String password,
    required double commissionRate,
    bool warehouseShareToRep = false,
  });

  /// Changes what is given; the rest stays.
  Future<WarehouseRep> updateRep(String repId, {double? commissionRate, bool? isActive, bool? warehouseShareToRep});

  Future<void> resetRepPassword(String repId, String password);

  Future<List<RepAssignedPharmacy>> getRepPharmacies(String repId);

  Future<WarehouseRepVisitsPage> getRepVisits({String? repId, String? after});

  // Pharmacy accounts
  Future<WarehouseAccountsPage> getAccounts({String? search, String? after});

  Future<WarehouseStatement> getStatement(String pharmacyId);

  /// The owner's summary for [period]: 'today', 'week' or 'month'.
  Future<WarehouseSummary> getSummary({String period = 'today'});

  /// Money received from a pharmacy, in SYP. [idempotencyKey] makes a retry
  /// safe: the same key never credits the pharmacy twice.
  Future<void> recordPayment({
    required String pharmacyId,
    required double amountSyp,
    required String method,
    required String idempotencyKey,
    String? note,
    String? deliveryOrderId,
  });

  /// Payments with an unconfirmed result, recoverable with their original key.
  Future<List<PendingPaymentRecord>> getPendingPayments();

  // Loyalty discount
  Future<WarehouseLoyalty> getLoyalty();

  Future<WarehouseLoyalty> updateLoyalty({
    required bool enabled,
    required List<LoyaltyTier> tiers,
    String mode = 'per_order',
    int? revision,
  });

  // Returns
  Future<WarehouseReturnsPage> getReturns({String? status, String? after});

  Future<WarehouseReturn> getReturn(String returnId);

  /// What approving would credit the pharmacy, in SYP.
  Future<double?> previewReturnCredit(String returnId);

  Future<WarehouseReturn> approveReturn(String returnId);

  Future<WarehouseReturn> rejectReturn(String returnId, String note);
}
