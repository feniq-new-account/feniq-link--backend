/// Where "getting the phone ready" stands.
///
/// [pending]: due but not started (the first launch, for the instant before
/// the gate asks the cubit to begin). [done] is shown for a moment as the
/// "all set" message, then the cubit returns to [idle].
enum PreparationStatus { idle, pending, running, done, failed }

/// Which part of the work is on.
enum PreparationStep { directory, warehouses }

class DataPreparationState {
  const DataPreparationState({
    this.status = PreparationStatus.idle,
    this.firstRun = false,
    this.step = PreparationStep.directory,
    this.fraction = 0,
    this.directoryLoaded = 0,
    this.directoryTotal = 0,
    this.warehouseName = '',
    this.warehouseIndex = 0,
    this.warehouseCount = 0,
    this.warehouseLoaded = 0,
    this.errorCode,
    this.errorMessage,
  });

  final PreparationStatus status;

  /// This phone has never finished the download: the full-screen "please wait"
  /// is shown. Every later run is silent.
  final bool firstRun;

  final PreparationStep step;

  /// Overall progress, 0..1.
  final double fraction;

  final int directoryLoaded;
  final int directoryTotal;

  final String warehouseName;

  /// 1-based number of the warehouse being downloaded, out of [warehouseCount].
  final int warehouseIndex;
  final int warehouseCount;

  /// Products of that warehouse that have arrived so far.
  final int warehouseLoaded;

  final String? errorCode;
  final String? errorMessage;

  /// Whether the full-screen "getting your pharmacy ready" covers the app.
  bool get showsOverlay => firstRun && status != PreparationStatus.idle;

  DataPreparationState copyWith({
    PreparationStatus? status,
    bool? firstRun,
    PreparationStep? step,
    double? fraction,
    int? directoryLoaded,
    int? directoryTotal,
    String? warehouseName,
    int? warehouseIndex,
    int? warehouseCount,
    int? warehouseLoaded,
    String? errorCode,
    String? errorMessage,
    bool clearError = false,
  }) {
    return DataPreparationState(
      status: status ?? this.status,
      firstRun: firstRun ?? this.firstRun,
      step: step ?? this.step,
      fraction: fraction ?? this.fraction,
      directoryLoaded: directoryLoaded ?? this.directoryLoaded,
      directoryTotal: directoryTotal ?? this.directoryTotal,
      warehouseName: warehouseName ?? this.warehouseName,
      warehouseIndex: warehouseIndex ?? this.warehouseIndex,
      warehouseCount: warehouseCount ?? this.warehouseCount,
      warehouseLoaded: warehouseLoaded ?? this.warehouseLoaded,
      errorCode: clearError ? null : (errorCode ?? this.errorCode),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}
