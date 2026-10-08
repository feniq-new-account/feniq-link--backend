import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

class WarehouseAccountsState {
  const WarehouseAccountsState({
    this.status = RepLoadStatus.initial,
    this.search = '',
    this.accounts = const [],
    this.hasMore = false,
    this.nextCursor,
    this.isLoadingMore = false,
    this.errorMessage,
    this.errorCode,
  });

  final RepLoadStatus status;
  final String search;
  final List<WarehouseAccountRow> accounts;
  final bool hasMore;
  final String? nextCursor;
  final bool isLoadingMore;
  final String? errorMessage;
  final String? errorCode;
}

/// The pharmacies the warehouse trades with, the largest balance owed first,
/// searchable by name or phone.
class WarehouseAccountsCubit extends Cubit<WarehouseAccountsState> {
  WarehouseAccountsCubit({required WarehouseManagementRepository repository})
    : _repository = repository,
      super(const WarehouseAccountsState());

  final WarehouseManagementRepository _repository;
  int _generation = 0;

  Future<void> setSearch(String search) async {
    final text = search.trim();
    if (text == state.search && state.status != RepLoadStatus.initial) return;
    emit(WarehouseAccountsState(search: text, accounts: state.accounts));
    await load();
  }

  Future<void> load() async {
    final generation = ++_generation;
    final search = state.search;
    emit(WarehouseAccountsState(status: RepLoadStatus.loading, search: search, accounts: state.accounts));
    try {
      final page = await _repository.getAccounts(search: search);
      if (generation != _generation || isClosed) return;
      emit(
        WarehouseAccountsState(
          status: RepLoadStatus.loaded,
          search: search,
          accounts: page.accounts,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure catch (f) {
      if (generation != _generation || isClosed) return;
      emit(
        WarehouseAccountsState(
          status: RepLoadStatus.error,
          search: search,
          accounts: state.accounts,
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
      final page = await _repository.getAccounts(search: state.search, after: cursor);
      if (generation != _generation || isClosed) return;
      emit(
        WarehouseAccountsState(
          status: state.status,
          search: state.search,
          accounts: [...state.accounts, ...page.accounts],
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure {
      if (generation == _generation && !isClosed) emit(_copy(isLoadingMore: false));
    }
  }

  /// Records a cash payment from a pharmacy straight from the list, then
  /// reloads it. True when the server took it. [idempotencyKey] stays the
  /// same for one payment, so a resend never credits the pharmacy twice.
  Future<bool> recordPayment({
    required String pharmacyId,
    required double amountSyp,
    required String idempotencyKey,
  }) async {
    try {
      await _repository.recordPayment(
        pharmacyId: pharmacyId,
        amountSyp: amountSyp,
        method: 'cash',
        idempotencyKey: idempotencyKey,
      );
    } on Failure {
      return false;
    }
    if (!isClosed) await load();
    return true;
  }

  WarehouseAccountsState _copy({required bool isLoadingMore}) => WarehouseAccountsState(
    status: state.status,
    search: state.search,
    accounts: state.accounts,
    hasMore: state.hasMore,
    nextCursor: state.nextCursor,
    isLoadingMore: isLoadingMore,
  );
}

class WarehouseStatementState {
  const WarehouseStatementState({
    this.status = RepLoadStatus.initial,
    this.statement,
    this.isSaving = false,
    this.errorMessage,
    this.errorCode,
    this.actionErrorMessage,
    this.actionErrorCode,
  });

  final RepLoadStatus status;
  final WarehouseStatement? statement;
  final bool isSaving;
  final String? errorMessage;
  final String? errorCode;
  final String? actionErrorMessage;
  final String? actionErrorCode;
}

/// One pharmacy's account with the warehouse, and recording money received.
class WarehouseStatementCubit extends Cubit<WarehouseStatementState> {
  WarehouseStatementCubit({
    required WarehouseManagementRepository repository,
    required this.pharmacyId,
    Uuid uuid = const Uuid(),
  }) : _repository = repository,
       _uuid = uuid,
       super(const WarehouseStatementState());

  final WarehouseManagementRepository _repository;
  final String pharmacyId;
  final Uuid _uuid;
  // Kept across retries of one payment, so a resend after a dropped
  // connection never credits the pharmacy twice; cleared once it lands.
  String? _pendingKey;

  Future<void> load() async {
    emit(WarehouseStatementState(status: RepLoadStatus.loading, statement: state.statement));
    try {
      final statement = await _repository.getStatement(pharmacyId);
      if (isClosed) return;
      emit(WarehouseStatementState(status: RepLoadStatus.loaded, statement: statement));
    } on Failure catch (f) {
      if (isClosed) return;
      emit(
        WarehouseStatementState(
          status: RepLoadStatus.error,
          statement: state.statement,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }

  /// True when the server recorded it; the statement then reloads.
  Future<bool> recordPayment({required double amountSyp, required String method, String? note}) async {
    if (state.isSaving || amountSyp <= 0) return false;
    _pendingKey ??= _uuid.v4();
    emit(WarehouseStatementState(status: state.status, statement: state.statement, isSaving: true));
    try {
      await _repository.recordPayment(
        pharmacyId: pharmacyId,
        amountSyp: amountSyp,
        method: method,
        idempotencyKey: _pendingKey!,
        note: note,
      );
      _pendingKey = null;
      if (isClosed) return true;
      await load();
      return true;
    } on Failure catch (f) {
      if (isClosed) return false;
      emit(
        WarehouseStatementState(
          status: state.status,
          statement: state.statement,
          actionErrorMessage: f.errMessage,
          actionErrorCode: f.code,
        ),
      );
      return false;
    }
  }

  /// The payment form was closed: the next payment is a new one.
  void discardPendingPayment() => _pendingKey = null;
}
