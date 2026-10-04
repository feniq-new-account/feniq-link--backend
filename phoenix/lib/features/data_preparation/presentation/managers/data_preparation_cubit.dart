import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/storage_keys.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/offline/offline_syncable.dart';
import 'package:feniq/core/services/storage_service.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';

import 'data_preparation_state.dart';

/// Gets the phone ready to work without a connection: the whole medicine
/// directory, then the catalogs of the warehouses around the pharmacy.
///
/// The first time on a phone this is the full-screen "please wait a couple of
/// minutes" with a progress bar. Every later start it is the same work done
/// quietly in the background, and only for what has gone stale - the
/// repositories skip a copy that is recent enough, so a fresh phone does it
/// all once and a daily phone only picks up what changed.
///
/// Global (main.dart) but scoped to one sign-in, like the warehouse list: a
/// sign-out wipes the saved data, so the next account starts from the first-run
/// state again.
class DataPreparationCubit extends Cubit<DataPreparationState> implements SessionScoped {
  DataPreparationCubit({
    required MedicineDirectoryRepository directoryRepository,
    required WarehouseRepository warehouseRepository,
    required CatalogRepository catalogRepository,
    required StorageService storageService,
    SessionScope? sessionScope,
    this.doneLinger = const Duration(milliseconds: 1200),
    this.maxWarehouses = 10,
  }) : _directory = directoryRepository,
       _warehouses = warehouseRepository,
       _catalog = catalogRepository,
       _storage = storageService,
       _sessionScope = sessionScope,
       super(_initialState(storageService)) {
    _sessionScope?.register(this);
  }

  final MedicineDirectoryRepository _directory;
  final WarehouseRepository _warehouses;
  final CatalogRepository _catalog;
  final StorageService _storage;
  final SessionScope? _sessionScope;

  /// How long "all set" stays on screen.
  final Duration doneLinger;

  /// The most warehouses downloaded up front; the rest are saved the first time
  /// one is opened with a connection.
  final int maxWarehouses;

  /// A quiet re-run (the app coming back to the front) is skipped when the last
  /// one finished less than this ago.
  static const Duration _minGap = Duration(minutes: 30);

  /// The directory is the bigger and slower part: the first 60% of the bar.
  static const double _directoryShare = 0.6;

  bool _working = false;
  DateTime? _lastFinishedAt;
  int _session = 0;

  static DataPreparationState _initialState(StorageService storage) {
    final due = storage.getString(StorageKeys.dataPreparedAt) == null;
    return DataPreparationState(status: due ? PreparationStatus.pending : PreparationStatus.idle, firstRun: due);
  }

  /// Starts the work (once at a time). [force] downloads again even what is
  /// recent - the "try again" of the failure screen.
  Future<void> start({bool force = false}) async {
    if (_working || isClosed) return;
    final last = _lastFinishedAt;
    if (!force && !state.firstRun && last != null && DateTime.now().difference(last) < _minGap) return;
    _working = true;
    final session = _session;
    try {
      await _run(force: force, session: session);
    } finally {
      _working = false;
    }
  }

  /// "Continue anyway": the pharmacist goes on without waiting (or without a
  /// connection to wait for). Whatever is still downloading carries on quietly.
  Future<void> skip() async {
    if (!state.firstRun) return;
    await _storage.setString(StorageKeys.dataPreparedAt, DateTime.now().toIso8601String());
    if (isClosed) return;
    emit(state.copyWith(status: PreparationStatus.idle, firstRun: false, clearError: true));
  }

  bool _stale(int session) => session != _session || isClosed;

  Future<void> _run({required bool force, required int session}) async {
    final firstRun = state.firstRun;
    emit(state.copyWith(status: PreparationStatus.running, step: PreparationStep.directory, fraction: 0, clearError: true));

    // 1. The medicine directory.
    Failure? failure;
    try {
      await _directory.sync(
        force: force,
        onProgress: (loaded, total) {
          if (_stale(session)) return;
          emit(
            state.copyWith(
              step: PreparationStep.directory,
              directoryLoaded: loaded,
              directoryTotal: total,
              fraction: total <= 0 ? 0 : _directoryShare * (loaded / total).clamp(0.0, 1.0),
            ),
          );
        },
      );
    } on Failure catch (f) {
      failure = f;
    }
    if (_stale(session)) return;
    // With a copy already on the phone a failed update is just "no connection
    // right now": the old copy serves, the next start tries again.
    final haveDirectory = await _directory.load() != null;
    if (_stale(session)) return;
    if (!haveDirectory) {
      _fail(failure, firstRun);
      return;
    }

    // 2. The warehouses around the pharmacy.
    final warehouses = <WarehouseModel>[];
    var warehousesOk = true;
    try {
      warehouses.addAll(await _pickWarehouses());
    } on Failure catch (f) {
      warehousesOk = false;
      failure ??= f;
    }
    if (_stale(session)) return;

    final syncable = _catalog is OfflineSyncable ? _catalog as OfflineSyncable : null;
    if (syncable != null) {
      for (var i = 0; i < warehouses.length; i++) {
        final warehouse = warehouses[i];
        emit(
          state.copyWith(
            step: PreparationStep.warehouses,
            warehouseName: warehouse.nameAr,
            warehouseIndex: i + 1,
            warehouseCount: warehouses.length,
            warehouseLoaded: 0,
            fraction: _warehouseFraction(i, warehouses.length, 0),
          ),
        );
        final ok = await syncable.syncForOffline(
          warehouse.id,
          force: force,
          onProgress: (loaded) {
            if (_stale(session)) return;
            emit(
              state.copyWith(
                warehouseLoaded: loaded,
                fraction: _warehouseFraction(i, warehouses.length, loaded),
              ),
            );
          },
        );
        if (_stale(session)) return;
        if (!ok) warehousesOk = false;
      }
    }

    // 3. Done.
    if (!warehousesOk && firstRun) {
      _fail(failure, firstRun);
      return;
    }
    _lastFinishedAt = DateTime.now();
    if (warehousesOk) await _storage.setString(StorageKeys.dataPreparedAt, _lastFinishedAt!.toIso8601String());
    if (_stale(session)) return;
    if (!firstRun) {
      emit(state.copyWith(status: PreparationStatus.idle, fraction: 1));
      return;
    }
    emit(state.copyWith(status: PreparationStatus.done, fraction: 1));
    await Future<void>.delayed(doneLinger);
    if (_stale(session)) return;
    emit(state.copyWith(status: PreparationStatus.idle, firstRun: false));
  }

  /// Own-city warehouses first, then the rest, up to [maxWarehouses].
  Future<List<WarehouseModel>> _pickWarehouses() async {
    final picked = <String, WarehouseModel>{};
    final own = await _warehouses.getWarehouses(onlyMyCity: true);
    for (final warehouse in own.warehouses) {
      picked[warehouse.id] = warehouse;
    }
    if (picked.length < maxWarehouses) {
      final all = await _warehouses.getWarehouses(onlyMyCity: false);
      for (final warehouse in all.warehouses) {
        picked.putIfAbsent(warehouse.id, () => warehouse);
      }
    }
    return picked.values.take(maxWarehouses).toList();
  }

  /// A warehouse's size is not known up front, so inside it the bar creeps
  /// towards the next warehouse's mark without ever reaching it.
  double _warehouseFraction(int index, int count, int loaded) {
    final share = (1 - _directoryShare) * 0.98 / count;
    final inner = loaded / (loaded + 1500);
    return _directoryShare + share * (index + inner);
  }

  void _fail(Failure? failure, bool firstRun) {
    emit(
      state.copyWith(
        status: firstRun ? PreparationStatus.failed : PreparationStatus.idle,
        errorCode: failure?.code ?? FailureCode.unexpected,
        errorMessage: failure?.errMessage,
      ),
    );
  }

  @override
  void resetForSignOut() {
    _session++;
    _working = false;
    _lastFinishedAt = null;
    unawaited(_storage.remove(StorageKeys.dataPreparedAt));
    if (isClosed) return;
    emit(const DataPreparationState(status: PreparationStatus.pending, firstRun: true));
  }

  @override
  Future<void> close() {
    _sessionScope?.unregister(this);
    return super.close();
  }
}
