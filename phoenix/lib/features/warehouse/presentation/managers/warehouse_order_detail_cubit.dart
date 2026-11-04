import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_orders_repository.dart';

class WarehouseOrderDetailState {
  const WarehouseOrderDetailState({
    this.status = RepLoadStatus.initial,
    this.order,
    this.isActing = false,
    this.isEditing = false,
    this.draftQuantities = const {},
    this.draftRemovals = const {},
    this.errorMessage,
    this.errorCode,
    this.actionErrorMessage,
    this.actionErrorCode,
  });

  final RepLoadStatus status;
  final WarehouseOrderDetail? order;
  // An advance or a save is on its way to the server.
  final bool isActing;
  // Correcting the items: quantities changed and lines dropped, not sent yet.
  final bool isEditing;
  final Map<String, int> draftQuantities;
  final Set<String> draftRemovals;
  final String? errorMessage;
  final String? errorCode;
  final String? actionErrorMessage;
  final String? actionErrorCode;

  /// The quantity a line shows while editing.
  int quantityOf(WarehouseOrderItem item) =>
      draftQuantities[item.id] ?? item.quantity;

  bool get hasDraftChanges =>
      draftRemovals.isNotEmpty || draftQuantities.isNotEmpty;

  /// The edit would leave the order with no lines at all - the pharmacy
  /// cancels an order, the warehouse never empties one.
  bool get draftRemovesEverything {
    final items = order?.items ?? const [];
    return items.isNotEmpty && items.every((i) => draftRemovals.contains(i.id));
  }

  WarehouseOrderDetailState copyWith({
    RepLoadStatus? status,
    WarehouseOrderDetail? order,
    bool? isActing,
    bool? isEditing,
    Map<String, int>? draftQuantities,
    Set<String>? draftRemovals,
    String? errorMessage,
    String? errorCode,
    bool clearError = false,
    String? actionErrorMessage,
    String? actionErrorCode,
    bool clearActionError = false,
  }) => WarehouseOrderDetailState(
    status: status ?? this.status,
    order: order ?? this.order,
    isActing: isActing ?? this.isActing,
    isEditing: isEditing ?? this.isEditing,
    draftQuantities: draftQuantities ?? this.draftQuantities,
    draftRemovals: draftRemovals ?? this.draftRemovals,
    errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    errorCode: clearError ? null : (errorCode ?? this.errorCode),
    actionErrorMessage: clearActionError
        ? null
        : (actionErrorMessage ?? this.actionErrorMessage),
    actionErrorCode: clearActionError
        ? null
        : (actionErrorCode ?? this.actionErrorCode),
  );
}

/// One order on the warehouse's phone: read it, move it on, or correct its
/// items before approving it.
class WarehouseOrderDetailCubit extends Cubit<WarehouseOrderDetailState> {
  WarehouseOrderDetailCubit({
    required WarehouseOrdersRepository repository,
    required this.orderId,
  }) : _repository = repository,
       super(const WarehouseOrderDetailState());

  final WarehouseOrdersRepository _repository;
  final String orderId;

  Future<void> load() async {
    emit(state.copyWith(status: RepLoadStatus.loading, clearError: true));
    try {
      final order = await _repository.getOrder(orderId);
      if (isClosed) return;
      emit(state.copyWith(status: RepLoadStatus.loaded, order: order));
    } on Failure catch (f) {
      if (isClosed) return;
      emit(
        state.copyWith(
          status: RepLoadStatus.error,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }

  /// Approve & send, or mark delivered. True when the server took it.
  Future<bool> advance() async {
    final order = state.order;
    if (order == null || state.isActing || order.nextStatus == null) {
      return false;
    }
    emit(state.copyWith(isActing: true, clearActionError: true));
    try {
      final result = await _repository.advance(
        orderId,
        expectedStatus: order.status,
        targetStatus: order.nextStatus,
      );
      if (isClosed) return true;
      emit(
        state.copyWith(
          isActing: false,
          order: order.withStatus(result.status, result.statusHistory),
        ),
      );
      return true;
    } on Failure catch (f) {
      if (isClosed) return false;
      emit(
        state.copyWith(
          isActing: false,
          actionErrorMessage: f.errMessage,
          actionErrorCode: f.code,
        ),
      );
      return false;
    }
  }

  void startEditing() {
    if (state.order?.isEditable != true) return;
    emit(
      state.copyWith(
        isEditing: true,
        draftQuantities: const {},
        draftRemovals: const {},
        clearActionError: true,
      ),
    );
  }

  void cancelEditing() {
    emit(
      state.copyWith(
        isEditing: false,
        draftQuantities: const {},
        draftRemovals: const {},
        clearActionError: true,
      ),
    );
  }

  void setQuantity(WarehouseOrderItem item, int quantity) {
    if (!state.isEditing || item.isPackageLine || quantity < 1) return;
    final next = {...state.draftQuantities};
    if (quantity == item.quantity) {
      next.remove(item.id);
    } else {
      next[item.id] = quantity;
    }
    emit(state.copyWith(draftQuantities: next));
  }

  /// Drops a line from the draft, or puts it back.
  void toggleRemoved(WarehouseOrderItem item) {
    if (!state.isEditing || item.isPackageLine) return;
    final removals = {...state.draftRemovals};
    if (!removals.remove(item.id)) removals.add(item.id);
    final quantities = {...state.draftQuantities}..remove(item.id);
    emit(state.copyWith(draftRemovals: removals, draftQuantities: quantities));
  }

  /// Sends the corrections. True when the server took them (or there were none).
  Future<bool> saveEdits() async {
    if (!state.isEditing || state.isActing) return false;
    if (!state.hasDraftChanges) {
      cancelEditing();
      return true;
    }
    if (state.draftRemovesEverything) return false;
    emit(state.copyWith(isActing: true, clearActionError: true));
    try {
      final updated = await _repository.updateItems(
        orderId,
        quantities: state.draftQuantities,
        removals: state.draftRemovals.toList(),
      );
      if (isClosed) return true;
      emit(
        WarehouseOrderDetailState(status: RepLoadStatus.loaded, order: updated),
      );
      return true;
    } on Failure catch (f) {
      if (isClosed) return false;
      emit(
        state.copyWith(
          isActing: false,
          actionErrorMessage: f.errMessage,
          actionErrorCode: f.code,
        ),
      );
      return false;
    }
  }
}
