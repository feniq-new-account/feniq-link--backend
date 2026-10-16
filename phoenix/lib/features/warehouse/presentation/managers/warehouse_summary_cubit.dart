import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

/// The periods the owner can pick (the server's `period` values).
const List<String> kSummaryPeriods = ['today', 'week', 'month'];

class WarehouseSummaryState {
  const WarehouseSummaryState({
    this.status = RepLoadStatus.initial,
    this.period = 'today',
    this.summary,
    this.errorMessage,
    this.errorCode,
  });

  final RepLoadStatus status;
  final String period;
  final WarehouseSummary? summary;
  final String? errorMessage;
  final String? errorCode;
}

/// The warehouse owner's at-a-glance summary: sales, collections, returns,
/// total debts, top buyers and top debtors for today / the last 7 days / this
/// month. Kept apart from the accounts list so a failed summary never hides
/// the pharmacies.
class WarehouseSummaryCubit extends Cubit<WarehouseSummaryState> {
  WarehouseSummaryCubit({required WarehouseManagementRepository repository})
    : _repository = repository,
      super(const WarehouseSummaryState());

  final WarehouseManagementRepository _repository;
  int _generation = 0;

  Future<void> setPeriod(String period) async {
    if (period == state.period && state.status != RepLoadStatus.initial) return;
    emit(WarehouseSummaryState(status: RepLoadStatus.loading, period: period, summary: state.summary));
    await load();
  }

  /// Fetches the current period. The previous figures stay on screen while it
  /// loads; a slower earlier answer never overwrites a newer one.
  Future<void> load() async {
    final generation = ++_generation;
    final period = state.period;
    emit(WarehouseSummaryState(status: RepLoadStatus.loading, period: period, summary: state.summary));
    try {
      final summary = await _repository.getSummary(period: period);
      if (generation != _generation || isClosed) return;
      emit(WarehouseSummaryState(status: RepLoadStatus.loaded, period: period, summary: summary));
    } on Failure catch (f) {
      if (generation != _generation || isClosed) return;
      emit(
        WarehouseSummaryState(
          status: RepLoadStatus.error,
          period: period,
          summary: state.summary,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }
}
