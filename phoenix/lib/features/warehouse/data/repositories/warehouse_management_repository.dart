import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';

/// A warehouse account's reps, pharmacy accounts and returns.
abstract class WarehouseManagementRepository {
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

  /// Money received from a pharmacy, in SYP. [idempotencyKey] makes a retry
  /// safe: the same key never credits the pharmacy twice.
  Future<void> recordPayment({
    required String pharmacyId,
    required double amountSyp,
    required String method,
    required String idempotencyKey,
    String? note,
  });

  // Loyalty discount
  Future<WarehouseLoyalty> getLoyalty();

  Future<WarehouseLoyalty> updateLoyalty({required bool enabled, required List<LoyaltyTier> tiers});

  // Returns
  Future<WarehouseReturnsPage> getReturns({String? status, String? after});

  Future<WarehouseReturn> getReturn(String returnId);

  /// What approving would credit the pharmacy, in SYP.
  Future<double?> previewReturnCredit(String returnId);

  Future<WarehouseReturn> approveReturn(String returnId);

  Future<WarehouseReturn> rejectReturn(String returnId, String note);
}
