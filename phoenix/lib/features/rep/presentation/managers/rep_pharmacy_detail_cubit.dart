import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';

import 'rep_load_status.dart';

class RepPharmacyDetailState {
  const RepPharmacyDetailState({this.status = RepLoadStatus.initial, this.detail, this.errorMessage, this.errorCode});

  final RepLoadStatus status;
  final RepPharmacyDetail? detail;
  final String? errorMessage;
  final String? errorCode;
}

class RepPharmacyDetailCubit extends Cubit<RepPharmacyDetailState> {
  RepPharmacyDetailCubit({required RepRepository repository, required this.pharmacyId})
    : _repository = repository,
      super(const RepPharmacyDetailState());

  final RepRepository _repository;
  final String pharmacyId;

  int _generation = 0;

  Future<void> load() async {
    if (isClosed) return;
    final generation = ++_generation;
    emit(RepPharmacyDetailState(status: RepLoadStatus.loading, detail: state.detail));
    try {
      final detail = await _repository.getPharmacy(pharmacyId);
      if (isClosed || generation != _generation) return;
      emit(RepPharmacyDetailState(status: RepLoadStatus.loaded, detail: detail));
    } on Failure catch (f) {
      if (isClosed || generation != _generation) return;
      emit(
        RepPharmacyDetailState(
          status: RepLoadStatus.error,
          detail: state.detail,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }
}
