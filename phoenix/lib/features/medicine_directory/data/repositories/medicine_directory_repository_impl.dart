import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/core/offline/offline_store.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';

import 'medicine_directory_repository.dart';

class MedicineDirectoryRepositoryImpl implements MedicineDirectoryRepository, SessionScoped {
  MedicineDirectoryRepositoryImpl({required ApiClient apiClient, required OfflineStore offlineStore, SessionScope? sessionScope})
    : _apiClient = apiClient,
      _store = offlineStore {
    sessionScope?.register(this);
  }

  final ApiClient _apiClient;
  final OfflineStore _store;

  static const String _storeName = 'medicine_directory';

  /// A copy younger than this is not refreshed on app start.
  static const Duration freshness = Duration(hours: 6);

  /// A copy older than this is downloaded again from scratch rather than
  /// patched - a medicine the server removed outright would otherwise never go.
  static const Duration fullRefreshAfter = Duration(days: 14);

  /// Pages of this many medicines: about 13,000 in seven requests.
  static const int pageSize = 2000;

  /// A safety stop: 100 pages of 2,000 is 200,000 medicines.
  static const int _maxPages = 100;

  /// The next update asks for what changed since the server's clock at the last
  /// download, minus this: an edit that was still being saved when the last
  /// download read the first page is picked up by the overlap, and folding a
  /// row in twice changes nothing.
  static const Duration _overlap = Duration(minutes: 2);

  MedicineDirectory? _current;
  Future<DirectorySyncOutcome>? _running;

  @override
  MedicineDirectory? get current => _current;

  @override
  Future<MedicineDirectory?> load() async {
    final inMemory = _current;
    if (inMemory != null) return inMemory;
    final entry = await _store.read(_storeName);
    if (entry == null) return null;
    final saved = MedicineDirectory.fromEntry(entry.savedAt, entry.data);
    // A sync that finished while the disk was being read wins.
    return _current ??= saved;
  }

  @override
  Future<DirectorySyncOutcome> sync({bool force = false, void Function(int loaded, int total)? onProgress}) {
    // Two screens asking at once share one download.
    return _running ??= _sync(force: force, onProgress: onProgress).whenComplete(() => _running = null);
  }

  Future<DirectorySyncOutcome> _sync({required bool force, void Function(int loaded, int total)? onProgress}) async {
    final existing = await load();
    final now = DateTime.now();
    if (existing != null && !force && now.difference(existing.savedAt) < freshness) {
      return DirectorySyncOutcome.upToDate;
    }
    final canPatch = existing != null && existing.serverTime != null && now.difference(existing.savedAt) < fullRefreshAfter;

    String? since;
    if (canPatch) {
      final last = DateTime.tryParse(existing.serverTime!);
      if (last != null) since = last.subtract(_overlap).toUtc().toIso8601String();
    }

    final incoming = <Map<String, dynamic>>[];
    String? serverTime;
    String? after;
    var total = 0;
    try {
      for (var page = 0; page < _maxPages; page++) {
        final response = await _apiClient.dio.get(
          Endpoints.catalogDirectory,
          queryParameters: {'limit': pageSize, if (after != null) 'after': after, if (since != null) 'since': since},
        );
        final data = response.data as Map<String, dynamic>;
        // The clock of the first page: whatever changes while the rest is
        // coming down is then asked for again next time, never missed.
        serverTime ??= data['serverTime'] as String?;
        incoming.addAll((data['items'] as List).whereType<Map<String, dynamic>>());
        final pagination = data['pagination'] as Map<String, dynamic>?;
        total = (pagination?['total'] as num?)?.toInt() ?? total;
        onProgress?.call(incoming.length, total < incoming.length ? incoming.length : total);
        final next = pagination?['nextCursor'] as String?;
        if (pagination?['hasMore'] != true || next == null) break;
        after = next;
      }
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }

    final startedFrom = since == null ? const <Map<String, dynamic>>[] : existing!.rows;
    final rows = await compute(mergeDirectoryRows, (startedFrom, incoming));
    final directory = MedicineDirectory(rows: rows, savedAt: now, serverTime: serverTime ?? existing?.serverTime);
    _current = directory;
    await _store.write(_storeName, directory.toJson(), savedAt: now, offThread: true);
    return since == null ? DirectorySyncOutcome.downloaded : DirectorySyncOutcome.updated;
  }

  // The previous account's copy goes with the rest of the saved data
  // (CatalogRepositoryImpl clears the store); here only the memory is dropped.
  @override
  void resetForSignOut() {
    _current = null;
    _running = null;
  }
}
