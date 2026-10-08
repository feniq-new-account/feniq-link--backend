import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

class WarehouseLoyaltyState {
  const WarehouseLoyaltyState({
    this.status = RepLoadStatus.initial,
    this.loyalty = const WarehouseLoyalty(),
    this.isSaving = false,
    this.errorMessage,
    this.errorCode,
    this.actionErrorMessage,
    this.actionErrorCode,
  });

  final RepLoadStatus status;
  // What the server holds.
  final WarehouseLoyalty loyalty;
  final bool isSaving;
  final String? errorMessage;
  final String? errorCode;
  final String? actionErrorMessage;
  final String? actionErrorCode;
}

/// The warehouse's loyalty discount: on/off and its tiers.
class WarehouseLoyaltyCubit extends Cubit<WarehouseLoyaltyState> {
  WarehouseLoyaltyCubit({required WarehouseManagementRepository repository})
    : _repository = repository,
      super(const WarehouseLoyaltyState());

  final WarehouseManagementRepository _repository;

  Future<void> load() async {
    emit(WarehouseLoyaltyState(status: RepLoadStatus.loading, loyalty: state.loyalty));
    try {
      final loyalty = await _repository.getLoyalty();
      if (isClosed) return;
      emit(WarehouseLoyaltyState(status: RepLoadStatus.loaded, loyalty: loyalty));
    } on Failure catch (f) {
      if (isClosed) return;
      emit(
        WarehouseLoyaltyState(
          status: RepLoadStatus.error,
          loyalty: state.loyalty,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }

  /// True when the server took it.
  Future<bool> save({required bool enabled, required List<LoyaltyTier> tiers}) async {
    if (state.isSaving) return false;
    emit(WarehouseLoyaltyState(status: state.status, loyalty: state.loyalty, isSaving: true));
    try {
      final loyalty = await _repository.updateLoyalty(enabled: enabled, tiers: tiers);
      if (isClosed) return true;
      emit(WarehouseLoyaltyState(status: RepLoadStatus.loaded, loyalty: loyalty));
      return true;
    } on Failure catch (f) {
      if (isClosed) return false;
      emit(
        WarehouseLoyaltyState(
          status: state.status,
          loyalty: state.loyalty,
          actionErrorMessage: f.errMessage,
          actionErrorCode: f.code,
        ),
      );
      return false;
    }
  }
}
