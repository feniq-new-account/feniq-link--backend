import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository.dart';

import 'directory_state.dart';

/// Browsing and searching the medicine directory on the phone.
///
/// Everything is answered from the saved copy, so it works with no connection
/// and costs no round trip; the network is only used to download the copy the
/// first time and to bring it up to date.
class DirectoryCubit extends Cubit<DirectoryState> {
  DirectoryCubit({required MedicineDirectoryRepository repository, this.searchDelay = const Duration(milliseconds: 200)})
    : _repository = repository,
      super(const DirectoryState());

  final MedicineDirectoryRepository _repository;

  /// Typing waits this long for the next letter before it searches.
  final Duration searchDelay;

  Timer? _searchTimer;

  /// Opens the saved copy, and - with a connection and a copy that has gone
  /// stale - quietly brings it up to date behind it.
  Future<void> load() async {
    final directory = await _repository.load();
    if (isClosed) return;
    if (directory == null) {
      emit(state.copyWith(status: DirectoryStatus.empty));
      return;
    }
    _show(directory);
    unawaited(_update(manual: false));
  }

  /// The first download from the empty screen.
  Future<void> download() async {
    emit(state.copyWith(status: DirectoryStatus.downloading, loaded: 0, downloadTotal: 0, clearError: true));
    try {
      await _repository.sync(
        force: true,
        onProgress: (loaded, total) {
          if (isClosed) return;
          emit(state.copyWith(loaded: loaded, downloadTotal: total));
        },
      );
    } on Failure catch (f) {
      if (isClosed) return;
      emit(state.copyWith(status: DirectoryStatus.empty, errorCode: f.code ?? FailureCode.unexpected));
      return;
    }
    final directory = _repository.current;
    if (isClosed) return;
    if (directory == null) {
      emit(state.copyWith(status: DirectoryStatus.empty));
      return;
    }
    _show(directory);
  }

  /// The update button: asks the server for what changed, now.
  Future<void> refresh() => _update(manual: true);

  Future<void> _update({required bool manual}) async {
    if (state.refreshing) return;
    emit(state.copyWith(refreshing: true, clearNotice: true));
    try {
      final outcome = await _repository.sync(force: manual);
      final directory = _repository.current;
      if (isClosed) return;
      if (directory != null && outcome != DirectorySyncOutcome.upToDate) {
        _show(directory, refreshing: false);
        if (manual) emit(state.copyWith(notice: DirectoryNotice.updated));
      } else {
        emit(state.copyWith(refreshing: false, notice: manual ? DirectoryNotice.upToDate : null));
      }
    } on Failure catch (f) {
      if (isClosed) return;
      // Offline (or the server down): the saved copy keeps serving. Only a
      // manual update says so.
      emit(
        state.copyWith(
          refreshing: false,
          errorCode: f.code,
          notice: manual ? DirectoryNotice.failed : null,
        ),
      );
    }
  }

  /// A new search text; the list follows after a short pause in typing.
  void search(String query) {
    _searchTimer?.cancel();
    if (_repository.current == null) return;
    if (searchDelay == Duration.zero) {
      _runSearch(query);
    } else {
      _searchTimer = Timer(searchDelay, () => _runSearch(query));
    }
  }

  void _runSearch(String query) {
    final directory = _repository.current;
    if (directory == null || isClosed) return;
    emit(state.copyWith(query: query, results: directory.search(query)));
  }

  void _show(MedicineDirectory directory, {bool? refreshing}) {
    emit(
      state.copyWith(
        status: DirectoryStatus.ready,
        results: directory.search(state.query),
        total: directory.length,
        savedAt: directory.savedAt,
        refreshing: refreshing,
        clearError: true,
      ),
    );
  }

  /// The medicines to offer in place of [item] (same ingredient, strength and form).
  List<DirectoryItem> alternativesOf(DirectoryItem item) =>
      _repository.current?.alternativesOf(item) ?? const [];

  @override
  Future<void> close() {
    _searchTimer?.cancel();
    return super.close();
  }
}
