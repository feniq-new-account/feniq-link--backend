import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/offline/offline_syncable.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';

import 'warehouse_selection_state.dart';

// Global (main.dart), but scoped to one sign-in. Pharmacies currently load
// every eligible warehouse; city filtering is retained internally for a
// future multi-city release, not exposed on today's home screen.
class WarehouseSelectionCubit extends Cubit<WarehouseSelectionState> implements SessionScoped {
  WarehouseSelectionCubit({
    required WarehouseRepository warehouseRepository,
    SessionScope? sessionScope,
    OfflineSyncable? offlineCatalogs,
  }) : _warehouseRepository = warehouseRepository,
       _sessionScope = sessionScope,
       _offlineCatalogs = offlineCatalogs,
       super(const WarehouseSelectionState()) {
    _sessionScope?.register(this);
  }

  final WarehouseRepository _warehouseRepository;
  final SessionScope? _sessionScope;
  // Keeps every listed warehouse's catalog on the phone, so the pharmacist
  // can browse and search all of them with no connection - not only the ones
  // already opened. Only the warehouses on Feniq: nothing else is downloaded.
  final OfflineSyncable? _offlineCatalogs;

  // Bumped by every sign-out, so a list requested for the previous account
  // can't land after the reset.
  int _session = 0;

  @override
  void resetForSignOut() {
    _session++;
    if (isClosed) return;
    emit(const WarehouseSelectionState());
  }

  @override
  Future<void> close() {
    _sessionScope?.unregister(this);
    return super.close();
  }

  /// Loads all eligible warehouses on first launch. No city selection is
  /// shown in the current single-city home UI.
  Future<void> loadWarehouses() => _load(onlyMyCity: state.onlyMyCity);

  /// The "my city" / "all cities" toggle. Re-fetches at the new scope, keeping
  /// the current list visible while it does (see [WarehouseSelectionState
  /// .isChangingScope]) so broadening the search doesn't flash an empty page.
  Future<void> setOnlyMyCity(bool onlyMyCity) {
    if (onlyMyCity == state.onlyMyCity) return Future.value();
    return _load(onlyMyCity: onlyMyCity, keepCurrentList: true);
  }

  // One warehouse at a time, in the background: the screen never waits on it.
  // A catalog saved today is skipped (syncForOffline's own daily check), and a
  // failed download keeps the previous copy. Stops if the pharmacist signs out.
  Future<void> retryOfflineCatalogs() => _keepCatalogsOffline(state.warehouses.map((w) => w.id).toList(), _session);

  Future<void> _keepCatalogsOffline(List<String> warehouseIds, int session) async {
    final sync = _offlineCatalogs;
    if (sync == null) return;
    for (final id in warehouseIds) {
      if (session != _session || isClosed) return;
      await sync.syncForOffline(id);
    }
  }

  Future<void> _load({required bool onlyMyCity, bool keepCurrentList = false}) async {
    emit(
      state.copyWith(
        // A scope change keeps the loaded list on screen and reports progress
        // through isChangingScope instead; only a genuine (re)load blanks it.
        status: keepCurrentList ? null : WarehouseListStatus.loading,
        isChangingScope: keepCurrentList,
        onlyMyCity: onlyMyCity,
      ),
    );
    final session = _session;
    try {
      final result = await _warehouseRepository.getWarehouses(onlyMyCity: onlyMyCity);
      if (session != _session) return;
      emit(
        state.copyWith(
          status: WarehouseListStatus.loaded,
          warehouses: result.warehouses,
          // What the server did, not what was asked for.
          cityFilterApplied: result.cityFilterApplied,
          // Sticky: a confirmed narrowing is proof this pharmacy has a city
          // worth offering a toggle for, and that stays true while the
          // pharmacist is looking at all cities.
          cityScopeAvailable: result.cityFilterApplied || state.cityScopeAvailable,
          isChangingScope: false,
        ),
      );
      unawaited(_keepCatalogsOffline(result.warehouses.map((w) => w.id).toList(), session));
    } on Failure catch (f) {
      if (session != _session) return;
      emit(
        state.copyWith(
          status: WarehouseListStatus.error,
          isChangingScope: false,
          errorMessage: f.errMessage,
          errorCode: f.code,
        ),
      );
    }
  }
}
