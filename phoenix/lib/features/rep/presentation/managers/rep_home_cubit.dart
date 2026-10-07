import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';

import 'rep_load_status.dart';

/// The rep's own profile and numbers (the Profile tab, and the header on the
/// pharmacies list).
class RepHomeState {
  const RepHomeState({this.status = RepLoadStatus.initial, this.me, this.errorMessage, this.errorCode});

  final RepLoadStatus status;
  final RepMe? me;
  final String? errorMessage;
  final String? errorCode;
}

class RepHomeCubit extends Cubit<RepHomeState> {
  RepHomeCubit({required RepRepository repository}) : _repository = repository, super(const RepHomeState());

  final RepRepository _repository;

  Future<void> load() async {
    // Keep what is on screen while it refreshes: a pull-to-refresh must not
    // blank the numbers.
    emit(RepHomeState(status: RepLoadStatus.loading, me: state.me));
    try {
      final me = await _repository.getMe();
      emit(RepHomeState(status: RepLoadStatus.loaded, me: me));
    } on Failure catch (f) {
      emit(RepHomeState(status: RepLoadStatus.error, me: state.me, errorMessage: f.errMessage, errorCode: f.code));
    }
  }
}
