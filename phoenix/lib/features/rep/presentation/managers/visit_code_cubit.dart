import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';

import 'rep_load_status.dart';

class VisitCodeState {
  const VisitCodeState({this.status = RepLoadStatus.initial, this.code, this.errorMessage, this.errorCode});

  final RepLoadStatus status;
  final VisitCode? code;
  final String? errorMessage;
  final String? errorCode;
}

/// The pharmacy's own visit QR, for it to show to a rep.
class VisitCodeCubit extends Cubit<VisitCodeState> {
  VisitCodeCubit({required RepRepository repository}) : _repository = repository, super(const VisitCodeState());

  final RepRepository _repository;

  Future<void> load() async {
    emit(VisitCodeState(status: RepLoadStatus.loading, code: state.code));
    try {
      final code = await _repository.getVisitCode();
      emit(VisitCodeState(status: RepLoadStatus.loaded, code: code));
    } on Failure catch (f) {
      emit(
        VisitCodeState(
          status: RepLoadStatus.error,
          code: state.code,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }
}
