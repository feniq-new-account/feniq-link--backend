import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';
import 'package:feniq/features/rep/data/visit_code.dart';

/// scanning -> (a Feniq QR is seen) -> locating -> submitting -> done, or
/// failed at either step. `scanning` is also where a QR that is not a Feniq
/// sticker leaves it, with [VisitScanState.notFeniqCode] set.
enum VisitScanStatus { scanning, locating, submitting, done, failed }

class VisitScanState {
  const VisitScanState({
    this.status = VisitScanStatus.scanning,
    this.notFeniqCode = false,
    this.result,
    this.locationProblem,
    this.errorMessage,
    this.errorCode,
  });

  final VisitScanStatus status;

  /// The last QR the camera saw was not a Feniq visit code.
  final bool notFeniqCode;
  final RecordedVisit? result;

  /// Set when the failure was the phone's position, not the server.
  final LocationProblem? locationProblem;
  final String? errorMessage;
  final String? errorCode;

  bool get isBusy => status == VisitScanStatus.locating || status == VisitScanStatus.submitting;
}

/// Logging a visit: the scanned QR plus where the phone is. Whether the visit
/// counts is the server's decision (distance to the pharmacy, mock flag); this
/// only gathers and sends.
class VisitScanCubit extends Cubit<VisitScanState> {
  VisitScanCubit({required RepRepository repository, required LocationProvider locationProvider})
    : _repository = repository,
      _locationProvider = locationProvider,
      super(const VisitScanState());

  final RepRepository _repository;
  final LocationProvider _locationProvider;

  /// Called by the camera for every frame that has a QR in it, many times a
  /// second - so anything but the `scanning` state is ignored.
  Future<void> onCodeDetected(String? raw) async {
    if (isClosed || state.status != VisitScanStatus.scanning) return;
    if (!looksLikeVisitCode(raw)) {
      if (!state.notFeniqCode) emit(const VisitScanState(notFeniqCode: true));
      return;
    }
    final code = raw!.trim();

    emit(const VisitScanState(status: VisitScanStatus.locating));
    final DeviceLocation location;
    try {
      location = await _locationProvider.current();
    } on LocationUnavailable catch (e) {
      if (isClosed) return;
      emit(VisitScanState(status: VisitScanStatus.failed, locationProblem: e.problem));
      return;
    }

    if (isClosed) return;
    emit(const VisitScanState(status: VisitScanStatus.submitting));
    try {
      final result = await _repository.recordVisit(
        code: code,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        isMocked: location.isMocked,
        capturedAt: location.capturedAt,
      );
      if (isClosed) return;
      emit(VisitScanState(status: VisitScanStatus.done, result: result));
    } on Failure catch (f) {
      if (isClosed) return;
      emit(VisitScanState(status: VisitScanStatus.failed, errorMessage: f.errMessage, errorCode: f.code));
    }
  }

  /// Back to the camera after a failure or a result.
  void scanAgain() {
    if (!isClosed && !state.isBusy) emit(const VisitScanState());
  }
}
