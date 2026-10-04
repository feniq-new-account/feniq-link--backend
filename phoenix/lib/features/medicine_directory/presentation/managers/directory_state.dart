import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';

/// [loading]: reading the saved copy. [empty]: nothing saved on this phone yet.
/// [downloading]: the first download is running. [ready]: browsing.
enum DirectoryStatus { loading, empty, downloading, ready }

class DirectoryState {
  const DirectoryState({
    this.status = DirectoryStatus.loading,
    this.query = '',
    this.results = const [],
    this.total = 0,
    this.savedAt,
    this.loaded = 0,
    this.downloadTotal = 0,
    this.refreshing = false,
    this.errorCode,
    this.notice,
  });

  final DirectoryStatus status;
  final String query;

  /// Everything that matches [query] (all of it when empty), by name.
  final List<DirectoryItem> results;

  /// How many medicines the phone holds.
  final int total;
  final DateTime? savedAt;

  /// Download progress.
  final int loaded;
  final int downloadTotal;

  /// A background update of an existing copy is running.
  final bool refreshing;

  /// The failure of the last download / update, if it failed.
  final String? errorCode;

  /// What the last manual update ended with.
  final DirectoryNotice? notice;

  DirectoryState copyWith({
    DirectoryStatus? status,
    String? query,
    List<DirectoryItem>? results,
    int? total,
    DateTime? savedAt,
    int? loaded,
    int? downloadTotal,
    bool? refreshing,
    String? errorCode,
    DirectoryNotice? notice,
    bool clearError = false,
    bool clearNotice = false,
  }) {
    return DirectoryState(
      status: status ?? this.status,
      query: query ?? this.query,
      results: results ?? this.results,
      total: total ?? this.total,
      savedAt: savedAt ?? this.savedAt,
      loaded: loaded ?? this.loaded,
      downloadTotal: downloadTotal ?? this.downloadTotal,
      refreshing: refreshing ?? this.refreshing,
      errorCode: clearError ? null : (errorCode ?? this.errorCode),
      notice: clearNotice ? null : (notice ?? this.notice),
    );
  }
}

/// One-shot message after the update button, shown once as a snack bar.
enum DirectoryNotice { upToDate, updated, failed }
