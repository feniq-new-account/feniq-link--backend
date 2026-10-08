import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

class WarehouseRepsState {
  const WarehouseRepsState({
    this.status = RepLoadStatus.initial,
    this.reps = const [],
    this.isSaving = false,
    this.errorMessage,
    this.errorCode,
    this.actionErrorMessage,
    this.actionErrorCode,
  });

  final RepLoadStatus status;
  final List<WarehouseRep> reps;
  // A create, an edit or a password reset is on its way.
  final bool isSaving;
  final String? errorMessage;
  final String? errorCode;
  final String? actionErrorMessage;
  final String? actionErrorCode;

  WarehouseRepsState copyWith({
    RepLoadStatus? status,
    List<WarehouseRep>? reps,
    bool? isSaving,
    String? errorMessage,
    String? errorCode,
    bool clearError = false,
    String? actionErrorMessage,
    String? actionErrorCode,
    bool clearActionError = false,
  }) => WarehouseRepsState(
    status: status ?? this.status,
    reps: reps ?? this.reps,
    isSaving: isSaving ?? this.isSaving,
    errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    errorCode: clearError ? null : (errorCode ?? this.errorCode),
    actionErrorMessage: clearActionError ? null : (actionErrorMessage ?? this.actionErrorMessage),
    actionErrorCode: clearActionError ? null : (actionErrorCode ?? this.actionErrorCode),
  );
}

/// The warehouse's field reps, with this month's numbers, and the account
/// actions on them: add one, change the commission, switch on/off, reset the
/// password.
class WarehouseRepsCubit extends Cubit<WarehouseRepsState> {
  WarehouseRepsCubit({required WarehouseManagementRepository repository})
    : _repository = repository,
      super(const WarehouseRepsState());

  final WarehouseManagementRepository _repository;

  Future<void> load() async {
    emit(state.copyWith(status: RepLoadStatus.loading, clearError: true));
    try {
      final reps = await _repository.getReps();
      if (isClosed) return;
      emit(state.copyWith(status: RepLoadStatus.loaded, reps: reps));
    } on Failure catch (f) {
      if (isClosed) return;
      emit(state.copyWith(status: RepLoadStatus.error, errorMessage: f.errMessage, errorCode: f.code));
    }
  }

  Future<bool> _save(Future<void> Function() action) async {
    if (state.isSaving) return false;
    emit(state.copyWith(isSaving: true, clearActionError: true));
    try {
      await action();
      if (!isClosed) emit(state.copyWith(isSaving: false));
      return true;
    } on Failure catch (f) {
      if (!isClosed) {
        emit(state.copyWith(isSaving: false, actionErrorMessage: f.errMessage, actionErrorCode: f.code));
      }
      return false;
    }
  }

  Future<bool> createRep({
    required String name,
    required String phone,
    required String password,
    required double commissionRate,
    bool warehouseShareToRep = false,
  }) async {
    final ok = await _save(
      () => _repository.createRep(
        name: name,
        phone: phone,
        password: password,
        commissionRate: commissionRate,
        warehouseShareToRep: warehouseShareToRep,
      ),
    );
    // The list's numbers come from the server; a fresh rep starts at zero.
    if (ok) await load();
    return ok;
  }

  Future<bool> updateRep(String repId, {double? commissionRate, bool? isActive, bool? warehouseShareToRep}) =>
      _save(() async {
    final updated = await _repository.updateRep(
      repId,
      commissionRate: commissionRate,
      isActive: isActive,
      warehouseShareToRep: warehouseShareToRep,
    );
    if (isClosed) return;
    emit(state.copyWith(reps: [for (final r in state.reps) r.id == repId ? r.withAccount(updated) : r]));
  });

  Future<bool> resetPassword(String repId, String password) =>
      _save(() => _repository.resetRepPassword(repId, password));
}
