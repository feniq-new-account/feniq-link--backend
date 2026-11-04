import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';

import 'rep_load_status.dart';

class RepPharmaciesState {
  const RepPharmaciesState({
    this.status = RepLoadStatus.initial,
    this.pharmacies = const [],
    this.query = '',
    this.errorMessage,
    this.errorCode,
  });

  final RepLoadStatus status;

  /// Longest-unvisited first, never-visited first of all (the server's order):
  /// the list doubles as "who do I go to next".
  final List<RepPharmacy> pharmacies;
  final String query;
  final String? errorMessage;
  final String? errorCode;
}

class RepPharmaciesCubit extends Cubit<RepPharmaciesState> {
  RepPharmaciesCubit({required RepRepository repository}) : _repository = repository, super(const RepPharmaciesState());

  final RepRepository _repository;

  // Answers can arrive out of order while the rep is still typing; only the
  // newest request may write to the state.
  int _request = 0;

  Future<void> load({String? search}) async {
    if (isClosed) return;
    final query = (search ?? state.query).trim();
    final request = ++_request;
    emit(
      RepPharmaciesState(
        status: RepLoadStatus.loading,
        pharmacies: query == state.query ? state.pharmacies : const [],
        query: query,
      ),
    );
    try {
      final pharmacies = await _repository.getPharmacies(search: query);
      if (isClosed || request != _request) return;
      emit(RepPharmaciesState(status: RepLoadStatus.loaded, pharmacies: pharmacies, query: query));
    } on Failure catch (f) {
      if (isClosed || request != _request) return;
      emit(
        RepPharmaciesState(
          status: RepLoadStatus.error,
          pharmacies: state.pharmacies,
          query: query,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }
}
