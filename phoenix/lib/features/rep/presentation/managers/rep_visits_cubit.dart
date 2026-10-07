import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';

import 'rep_load_status.dart';

class RepVisitsState {
  const RepVisitsState({
    this.status = RepLoadStatus.initial,
    this.visits = const [],
    this.hasMore = false,
    this.nextCursor,
    this.isLoadingMore = false,
    this.errorMessage,
    this.errorCode,
  });

  final RepLoadStatus status;
  final List<RepVisit> visits;
  final bool hasMore;
  final String? nextCursor;
  final bool isLoadingMore;
  final String? errorMessage;
  final String? errorCode;
}

/// The rep's own visit log, newest first, a page at a time.
class RepVisitsCubit extends Cubit<RepVisitsState> {
  RepVisitsCubit({required RepRepository repository}) : _repository = repository, super(const RepVisitsState());

  final RepRepository _repository;

  Future<void> load() async {
    emit(RepVisitsState(status: RepLoadStatus.loading, visits: state.visits));
    try {
      final page = await _repository.getVisits();
      emit(
        RepVisitsState(
          status: RepLoadStatus.loaded,
          visits: page.visits,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure catch (f) {
      emit(
        RepVisitsState(
          status: RepLoadStatus.error,
          visits: state.visits,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }

  Future<void> loadMore() async {
    final cursor = state.nextCursor;
    if (state.isLoadingMore || !state.hasMore || cursor == null) return;
    emit(
      RepVisitsState(
        status: RepLoadStatus.loaded,
        visits: state.visits,
        hasMore: state.hasMore,
        nextCursor: cursor,
        isLoadingMore: true,
      ),
    );
    try {
      final page = await _repository.getVisits(after: cursor);
      emit(
        RepVisitsState(
          status: RepLoadStatus.loaded,
          visits: [...state.visits, ...page.visits],
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        ),
      );
    } on Failure {
      // The rows already on screen stay; the next scroll to the end retries.
      emit(
        RepVisitsState(
          status: RepLoadStatus.loaded,
          visits: state.visits,
          hasMore: state.hasMore,
          nextCursor: cursor,
        ),
      );
    }
  }
}
