import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

class WarehouseReturnsState {
  const WarehouseReturnsState({
    this.status = RepLoadStatus.initial,
    this.filter = 'pending',
    this.returns = const [],
    this.hasMore = false,
    this.nextCursor,
    this.isLoadingMore = false,
    this.errorMessage,
    this.errorCode,
  });

  final RepLoadStatus status;
  // Null is every return. Opens on what waits for the warehouse.
  final String? filter;
  final List<WarehouseReturn> returns;
  final bool hasMore;
  final String? nextCursor;
  final bool isLoadingMore;
  final String? errorMessage;
  final String? errorCode;
}

/// The pharmacies' return requests on the warehouse's orders.
class WarehouseReturnsCubit extends Cubit<WarehouseReturnsState> {
  WarehouseReturnsCubit({required WarehouseManagementRepository repository})
    : _repository = repository,
      super(const WarehouseReturnsState());

  final WarehouseManagementRepository _repository;
  int _generation = 0;

  Future<void> setFilter(String? filter) async {
    if (filter == state.filter && state.status != RepLoadStatus.initial) return;
    emit(WarehouseReturnsState(filter: filter));
    await load();
  }

  Future<void> load() async {
    final generation = ++_generation;
    final filter = state.filter;
    emit(WarehouseReturnsState(status: RepLoadStatus.loading, filter: filter, returns: state.returns));
    try {
      final page = await _repository.getReturns(status: filter);
      if (generation != _generation || isClosed) return;
      emit(
        WarehouseReturnsState(
          status: RepLoadStatus.loaded,
          filter: filter,
          returns: page.returns,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure catch (f) {
      if (generation != _generation || isClosed) return;
      emit(
        WarehouseReturnsState(
          status: RepLoadStatus.error,
          filter: filter,
          returns: state.returns,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }

  Future<void> loadMore() async {
    final cursor = state.nextCursor;
    if (state.isLoadingMore || !state.hasMore || cursor == null) return;
    final generation = _generation;
    emit(_copy(isLoadingMore: true));
    try {
      final page = await _repository.getReturns(status: state.filter, after: cursor);
      if (generation != _generation || isClosed) return;
      emit(
        WarehouseReturnsState(
          status: state.status,
          filter: state.filter,
          returns: [...state.returns, ...page.returns],
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure {
      if (generation == _generation && !isClosed) emit(_copy(isLoadingMore: false));
    }
  }

  /// The detail screen resolved a return: its row shows the outcome in place.
  void applyReturn(WarehouseReturn updated) {
    emit(
      WarehouseReturnsState(
        status: state.status,
        filter: state.filter,
        returns: [for (final r in state.returns) r.id == updated.id ? updated : r],
        hasMore: state.hasMore,
        nextCursor: state.nextCursor,
      ),
    );
  }

  WarehouseReturnsState _copy({required bool isLoadingMore}) => WarehouseReturnsState(
    status: state.status,
    filter: state.filter,
    returns: state.returns,
    hasMore: state.hasMore,
    nextCursor: state.nextCursor,
    isLoadingMore: isLoadingMore,
  );
}

class WarehouseReturnDetailState {
  const WarehouseReturnDetailState({
    this.status = RepLoadStatus.initial,
    this.returnRequest,
    this.creditPreviewSyp,
    this.isActing = false,
    this.errorMessage,
    this.errorCode,
    this.actionErrorMessage,
    this.actionErrorCode,
  });

  final RepLoadStatus status;
  final WarehouseReturn? returnRequest;
  // What approving would credit, shown before the warehouse commits.
  final double? creditPreviewSyp;
  final bool isActing;
  final String? errorMessage;
  final String? errorCode;
  final String? actionErrorMessage;
  final String? actionErrorCode;

  WarehouseReturnDetailState copyWith({
    RepLoadStatus? status,
    WarehouseReturn? returnRequest,
    double? creditPreviewSyp,
    bool? isActing,
    String? errorMessage,
    String? errorCode,
    String? actionErrorMessage,
    String? actionErrorCode,
    bool clearActionError = false,
  }) => WarehouseReturnDetailState(
    status: status ?? this.status,
    returnRequest: returnRequest ?? this.returnRequest,
    creditPreviewSyp: creditPreviewSyp ?? this.creditPreviewSyp,
    isActing: isActing ?? this.isActing,
    errorMessage: errorMessage ?? this.errorMessage,
    errorCode: errorCode ?? this.errorCode,
    actionErrorMessage: clearActionError ? null : (actionErrorMessage ?? this.actionErrorMessage),
    actionErrorCode: clearActionError ? null : (actionErrorCode ?? this.actionErrorCode),
  );
}

/// One return: what came back and why, what approving would credit, and the
/// two outcomes (approve credits the pharmacy's account; reject needs a note).
class WarehouseReturnDetailCubit extends Cubit<WarehouseReturnDetailState> {
  WarehouseReturnDetailCubit({required WarehouseManagementRepository repository, required this.returnId})
    : _repository = repository,
      super(const WarehouseReturnDetailState());

  final WarehouseManagementRepository _repository;
  final String returnId;

  Future<void> load() async {
    emit(state.copyWith(status: RepLoadStatus.loading));
    try {
      final returnRequest = await _repository.getReturn(returnId);
      double? preview;
      if (returnRequest.isPending) {
        try {
          preview = await _repository.previewReturnCredit(returnId);
        } on Failure {
          // The figure is a courtesy; approving still works without it.
        }
      }
      if (isClosed) return;
      emit(
        WarehouseReturnDetailState(
          status: RepLoadStatus.loaded,
          returnRequest: returnRequest,
          creditPreviewSyp: preview,
        ),
      );
    } on Failure catch (f) {
      if (isClosed) return;
      emit(state.copyWith(status: RepLoadStatus.error, errorMessage: f.errMessage, errorCode: f.code));
    }
  }

  Future<bool> _resolve(Future<WarehouseReturn> Function() call) async {
    final current = state.returnRequest;
    if (current == null || !current.isPending || state.isActing) return false;
    emit(state.copyWith(isActing: true, clearActionError: true));
    try {
      final resolved = await call();
      if (isClosed) return true;
      emit(
        state.copyWith(
          isActing: false,
          returnRequest: current.resolved(
            status: resolved.status,
            rejectionNote: resolved.rejectionNote,
            creditSyp: resolved.creditSyp,
            resolvedAt: resolved.resolvedAt,
          ),
        ),
      );
      return true;
    } on Failure catch (f) {
      if (isClosed) return false;
      emit(state.copyWith(isActing: false, actionErrorMessage: f.errMessage, actionErrorCode: f.code));
      return false;
    }
  }

  Future<bool> approve() => _resolve(() => _repository.approveReturn(returnId));

  Future<bool> reject(String note) {
    final text = note.trim();
    if (text.isEmpty) return Future.value(false);
    return _resolve(() => _repository.rejectReturn(returnId, text));
  }
}
