import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

class WarehouseRepDetailState {
  const WarehouseRepDetailState({
    this.status = RepLoadStatus.initial,
    this.pharmacies = const [],
    this.visits = const [],
    this.hasMoreVisits = false,
    this.nextCursor,
    this.isLoadingMore = false,
    this.loadMoreError = false,
    this.errorMessage,
    this.errorCode,
  });

  final RepLoadStatus status;
  final List<RepAssignedPharmacy> pharmacies;
  final List<WarehouseRepVisit> visits;
  final bool hasMoreVisits;
  final String? nextCursor;
  final bool isLoadingMore;
  final bool loadMoreError;
  final String? errorMessage;
  final String? errorCode;
}

/// One rep: the pharmacies they cover and their visits, newest first.
class WarehouseRepDetailCubit extends Cubit<WarehouseRepDetailState> {
  WarehouseRepDetailCubit({required WarehouseManagementRepository repository, required this.repId})
    : _repository = repository,
      super(const WarehouseRepDetailState());

  final WarehouseManagementRepository _repository;
  final String repId;

  int _generation = 0;

  Future<void> load() async {
    if (isClosed) return;
    final generation = ++_generation;
    emit(WarehouseRepDetailState(status: RepLoadStatus.loading, pharmacies: state.pharmacies, visits: state.visits));
    try {
      final results = await Future.wait([_repository.getRepPharmacies(repId), _repository.getRepVisits(repId: repId)]);
      if (isClosed || generation != _generation) return;
      final page = results[1] as WarehouseRepVisitsPage;
      emit(
        WarehouseRepDetailState(
          status: RepLoadStatus.loaded,
          pharmacies: results[0] as List<RepAssignedPharmacy>,
          visits: page.visits,
          hasMoreVisits: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure catch (f) {
      if (isClosed || generation != _generation) return;
      emit(
        WarehouseRepDetailState(
          status: RepLoadStatus.error,
          pharmacies: state.pharmacies,
          visits: state.visits,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }

  Future<void> loadMoreVisits() async {
    final cursor = state.nextCursor;
    if (isClosed ||
        state.status == RepLoadStatus.loading ||
        state.isLoadingMore ||
        !state.hasMoreVisits ||
        cursor == null) {
      return;
    }
    final generation = _generation;
    emit(_with(isLoadingMore: true));
    try {
      final page = await _repository.getRepVisits(repId: repId, after: cursor);
      if (isClosed || generation != _generation) return;
      final seen = state.visits.map((v) => v.id).toSet();
      emit(
        WarehouseRepDetailState(
          status: RepLoadStatus.loaded,
          pharmacies: state.pharmacies,
          visits: [...state.visits, ...page.visits.where((v) => seen.add(v.id))],
          hasMoreVisits: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure catch (f) {
      if (!isClosed && generation == _generation) {
        emit(
          WarehouseRepDetailState(
            status: RepLoadStatus.error,
            pharmacies: state.pharmacies,
            visits: state.visits,
            hasMoreVisits: state.hasMoreVisits,
            nextCursor: state.nextCursor,
            loadMoreError: true,
            errorCode: f.code,
            errorMessage: f.errMessage,
          ),
        );
      }
    }
  }

  WarehouseRepDetailState _with({required bool isLoadingMore}) => WarehouseRepDetailState(
    status: state.status,
    pharmacies: state.pharmacies,
    visits: state.visits,
    hasMoreVisits: state.hasMoreVisits,
    nextCursor: state.nextCursor,
    isLoadingMore: isLoadingMore,
  );
}
