import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_orders_repository.dart';

class WarehouseOrdersState {
  const WarehouseOrdersState({
    this.status = RepLoadStatus.initial,
    this.filter = 'pending',
    this.orders = const [],
    this.hasMore = false,
    this.nextCursor,
    this.isLoadingMore = false,
    this.advancingIds = const {},
    this.errorMessage,
    this.errorCode,
    this.actionErrorCode,
    this.actionErrorMessage,
  });

  final RepLoadStatus status;
  // The status tab; null is "all". Opens on what needs the warehouse first.
  final String? filter;
  final List<WarehouseOrderSummary> orders;
  final bool hasMore;
  final String? nextCursor;
  final bool isLoadingMore;
  // Orders whose advance is on its way to the server (their button spins).
  final Set<String> advancingIds;
  final String? errorMessage;
  final String? errorCode;
  // The last advance that failed, for a one-off message under the list.
  final String? actionErrorCode;
  final String? actionErrorMessage;

  WarehouseOrdersState copyWith({
    RepLoadStatus? status,
    List<WarehouseOrderSummary>? orders,
    bool? hasMore,
    String? nextCursor,
    bool clearCursor = false,
    bool? isLoadingMore,
    Set<String>? advancingIds,
    String? errorMessage,
    String? errorCode,
    bool clearError = false,
    String? actionErrorCode,
    String? actionErrorMessage,
    bool clearActionError = false,
  }) => WarehouseOrdersState(
    status: status ?? this.status,
    filter: filter,
    orders: orders ?? this.orders,
    hasMore: hasMore ?? this.hasMore,
    nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    advancingIds: advancingIds ?? this.advancingIds,
    errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    errorCode: clearError ? null : (errorCode ?? this.errorCode),
    actionErrorCode: clearActionError ? null : (actionErrorCode ?? this.actionErrorCode),
    actionErrorMessage: clearActionError ? null : (actionErrorMessage ?? this.actionErrorMessage),
  );
}

/// The warehouse's orders, one status tab at a time, oldest first (the order
/// to work through them in). An order advanced from the list stays where it
/// is with its new status, like the panel, so it never vanishes mid-work.
class WarehouseOrdersCubit extends Cubit<WarehouseOrdersState> {
  WarehouseOrdersCubit({required WarehouseOrdersRepository repository})
    : _repository = repository,
      super(const WarehouseOrdersState());

  final WarehouseOrdersRepository _repository;
  // Bumped on every fresh load, so a slow answer for an older tab is dropped.
  int _generation = 0;

  Future<void> setFilter(String? filter) async {
    if (filter == state.filter && state.status != RepLoadStatus.initial) return;
    emit(WarehouseOrdersState(filter: filter));
    await load();
  }

  Future<void> load() async {
    final generation = ++_generation;
    final filter = state.filter;
    emit(state.copyWith(status: RepLoadStatus.loading, clearError: true, clearActionError: true));
    try {
      final page = await _repository.getOrders(status: filter);
      if (generation != _generation || isClosed) return;
      emit(
        WarehouseOrdersState(
          status: RepLoadStatus.loaded,
          filter: filter,
          orders: page.orders,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure catch (f) {
      if (generation != _generation || isClosed) return;
      emit(state.copyWith(status: RepLoadStatus.error, errorMessage: f.errMessage, errorCode: f.code));
    }
  }

  Future<void> loadMore() async {
    final cursor = state.nextCursor;
    if (state.isLoadingMore || !state.hasMore || cursor == null) return;
    final generation = _generation;
    emit(state.copyWith(isLoadingMore: true));
    try {
      final page = await _repository.getOrders(status: state.filter, after: cursor);
      if (generation != _generation || isClosed) return;
      final seen = state.orders.map((o) => o.id).toSet();
      emit(
        state.copyWith(
          orders: [...state.orders, ...page.orders.where((o) => !seen.contains(o.id))],
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          clearCursor: page.nextCursor == null,
          isLoadingMore: false,
        ),
      );
    } on Failure catch (f) {
      if (generation != _generation || isClosed) return;
      emit(state.copyWith(isLoadingMore: false, actionErrorMessage: f.errMessage, actionErrorCode: f.code));
    }
  }

  /// One tap on a row's button: approve & send, or mark delivered.
  Future<bool> advance(String orderId) async {
    if (state.advancingIds.contains(orderId)) return false;
    emit(state.copyWith(advancingIds: {...state.advancingIds, orderId}, clearActionError: true));
    try {
      final result = await _repository.advance(orderId);
      if (isClosed) return true;
      emit(
        state.copyWith(
          orders: [for (final o in state.orders) o.id == orderId ? o.copyWith(status: result.status) : o],
          advancingIds: {...state.advancingIds}..remove(orderId),
        ),
      );
      return true;
    } on Failure catch (f) {
      if (isClosed) return false;
      emit(
        state.copyWith(
          advancingIds: {...state.advancingIds}..remove(orderId),
          actionErrorMessage: f.errMessage,
          actionErrorCode: f.code,
        ),
      );
      return false;
    }
  }

  /// The detail screen came back with the order as it now is: its status,
  /// total and item count change in place.
  void applyDetail(WarehouseOrderDetail detail) {
    emit(
      state.copyWith(
        orders: [
          for (final o in state.orders)
            o.id == detail.id
                ? o.copyWith(status: detail.status, finalPrice: detail.finalPrice, itemCount: detail.items.length)
                : o,
        ],
      ),
    );
  }
}
