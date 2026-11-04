import 'dart:async';

import 'package:dio/dio.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/network/endpoints.dart';
import 'package:feniq/core/offline/daily_refresh.dart';
import 'package:feniq/core/offline/catalog_download_status.dart';
import 'package:feniq/core/offline/permanent_image_store.dart';
import 'package:feniq/core/offline/offline_status.dart';
import 'package:feniq/core/offline/offline_store.dart';
import 'package:feniq/core/offline/offline_syncable.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/catalog/data/models/category_model.dart';
import 'package:feniq/features/catalog/data/models/elsewhere_alternative.dart';
import 'package:feniq/features/catalog/data/offline/catalog_snapshot.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';

import 'catalog_repository.dart';

class CatalogRepositoryImpl implements CatalogRepository, OfflineSyncable, SessionScoped {
  CatalogRepositoryImpl({required ApiClient apiClient, SessionScope? sessionScope, OfflineStore? offlineStore})
    : _apiClient = apiClient,
      _store = offlineStore {
    sessionScope?.register(this);
  }

  final ApiClient _apiClient;

  // Where the phone keeps its saved copy of each warehouse's catalog, so it can
  // still be browsed and searched with no connection. Null: no offline support
  // (the tests that do not care).
  final OfflineStore? _store;
  final Map<String, CatalogSnapshot> _snapshots = {};
  final Map<String, int> _syncing = {};
  int _session = 0;

  // A warehouse's saved copy taken since today's cutoff (DailyRefresh): the
  // catalog screens read it instead of asking the server.
  Future<CatalogSnapshot?> _todaysSnapshot(String warehouseId) async {
    final snapshot = await _snapshotFor(warehouseId);
    return snapshot != null && DailyRefresh.isCurrent(snapshot.savedAt) ? snapshot : null;
  }

  /// A safety stop: 100 products a page, so 300 pages is 30,000 products.
  static const int _maxSyncPages = 300;

  static String _snapshotName(String warehouseId) => 'catalog_$warehouseId';
  static const String _categoriesName = 'categories';

  // Only "could not reach the server" justifies answering from the saved copy;
  // a real answer from the server (401, 404, 500 ...) is shown as it is.
  static bool _isConnectionFailure(Failure failure) =>
      failure is ServerFailure && (failure.code == FailureCode.network || failure.code == FailureCode.timeout);

  Future<CatalogSnapshot?> _snapshotFor(String warehouseId) async {
    final inMemory = _snapshots[warehouseId];
    if (inMemory != null) return inMemory;
    final store = _store;
    if (store == null) return null;
    final session = _session;
    final entry = await store.read(_snapshotName(warehouseId));
    if (session != _session) return null;
    if (entry == null) return null;
    final snapshot = CatalogSnapshot.fromEntry(warehouseId, entry.savedAt, entry.data);
    if (snapshot != null) {
      _snapshots[warehouseId] = snapshot;
      CatalogDownloadStatus.instance.set(
        warehouseId,
        CatalogDownloadEntry(
          CatalogDownloadPhase.saved,
          savedAt: snapshot.savedAt,
          productCount: snapshot.products.length,
        ),
      );
    }
    return snapshot;
  }

  // Catalog overhaul Phase 11 (L4): the categories are read once per sign-in
  // and reused on every catalog open, instead of refetched each time. Two
  // opens racing share the one request; a failed read is not cached, so the
  // next open simply tries again.
  List<CategoryModel>? _categories;
  Future<List<CategoryModel>>? _categoriesRequest;

  @override
  Future<List<CategoryModel>> getCategories() {
    final cached = _categories;
    if (cached != null) return Future.value(cached);
    final session = _session;
    return _categoriesRequest ??= _fetchCategories().then(
      (categories) {
        if (session == _session) {
          _categories = categories;
          _categoriesRequest = null;
        }
        return categories;
      },
      onError: (Object error, StackTrace stackTrace) {
        if (session == _session) _categoriesRequest = null;
        Error.throwWithStackTrace(error, stackTrace);
      },
    );
  }

  Future<List<CategoryModel>> _fetchCategories() async {
    final session = _session;
    try {
      final response = await _apiClient.dio.get(Endpoints.categories);
      final data = response.data as Map<String, dynamic>;
      final categories = (data['categories'] as List).cast<Map<String, dynamic>>();
      OfflineStatus.instance.live();
      if (session == _session) unawaited(_store?.write(_categoriesName, categories) ?? Future<void>.value());
      return categories.map(CategoryModel.fromJson).toList();
    } on DioException catch (e) {
      final failure = ServerFailure.fromDioError(e);
      if (_isConnectionFailure(failure)) {
        final saved = await _store?.read(_categoriesName);
        final rows = saved?.data;
        if (rows is List) {
          OfflineStatus.instance.servedFromSavedCopy(saved!.savedAt);
          return rows.whereType<Map<String, dynamic>>().map(CategoryModel.fromJson).toList();
        }
      }
      throw failure;
    }
  }

  // The next account reads the categories fresh.
  @override
  void resetForSignOut() {
    _session++;
    _syncing.clear();
    CatalogDownloadStatus.instance.clear();
    _categories = null;
    _categoriesRequest = null;
    // The saved catalogs are the previous account's: the next person to sign in
    // on this phone must not browse them.
    _snapshots.clear();
    OfflineStatus.instance.live();
    unawaited(_store?.clear() ?? Future<void>.value());
  }

  @override
  Future<PaginatedResult<ProductModel>> getProducts({
    required String warehouseId,
    String? search,
    String? categoryId,
    String? manufacturer,
    int? limit,
    String? after,
  }) async {
    final today = await _todaysSnapshot(warehouseId);
    if (today != null) {
      return today.query(
        search: search,
        categoryId: categoryId,
        manufacturer: manufacturer,
        limit: limit ?? 20,
        after: after,
      );
    }
    try {
      final response = await _apiClient.dio.get(
        Endpoints.warehouseProducts(warehouseId),
        queryParameters: {
          if (search != null && search.isNotEmpty) 'search': search,
          if (categoryId != null) 'categoryId': categoryId,
          if (manufacturer != null) 'manufacturer': manufacturer,
          if (limit != null) 'limit': limit,
          if (after != null) 'after': after,
        },
      );
      final data = response.data as Map<String, dynamic>;
      OfflineStatus.instance.live();
      return PaginatedResult.fromJsonSkippingInvalid(data, 'products', ProductModel.tryFromJson);
    } on DioException catch (e) {
      final failure = ServerFailure.fromDioError(e);
      if (_isConnectionFailure(failure)) {
        final snapshot = await _snapshotFor(warehouseId);
        if (snapshot != null) {
          OfflineStatus.instance.servedFromSavedCopy(snapshot.savedAt);
          return snapshot.query(
            search: search,
            categoryId: categoryId,
            manufacturer: manufacturer,
            limit: limit ?? 20,
            after: after,
          );
        }
      }
      throw failure;
    }
  }

  @override
  Future<List<ProductModel>> getAlternatives({required String warehouseId, required String productId}) async {
    final today = await _todaysSnapshot(warehouseId);
    if (today != null) return today.alternativesOf(productId);
    try {
      final response = await _apiClient.dio.get(Endpoints.productAlternatives(warehouseId, productId));
      final data = response.data as Map<String, dynamic>;
      OfflineStatus.instance.live();
      return PaginatedResult.fromJsonSkippingInvalid(data, 'products', ProductModel.tryFromJson).items;
    } on DioException catch (e) {
      final failure = ServerFailure.fromDioError(e);
      if (_isConnectionFailure(failure)) {
        final snapshot = await _snapshotFor(warehouseId);
        if (snapshot != null) {
          OfflineStatus.instance.servedFromSavedCopy(snapshot.savedAt);
          return snapshot.alternativesOf(productId);
        }
      }
      throw failure;
    }
  }

  @override
  Future<List<ElsewhereAlternative>> getAlternativesElsewhere({
    required String warehouseId,
    required String productId,
  }) async {
    try {
      final response = await _apiClient.dio.get(Endpoints.productAlternativesElsewhere(warehouseId, productId));
      final data = response.data as Map<String, dynamic>;
      final raw = data['alternatives'];
      if (raw is! List) return const [];
      return [
        for (final entry in raw)
          if (entry is Map<String, dynamic>) ?ElsewhereAlternative.tryFromJson(entry),
      ];
    } on DioException catch (e) {
      throw ServerFailure.fromDioError(e);
    }
  }

  @override
  Future<List<ManufacturerModel>> getManufacturers({required String warehouseId}) async {
    final today = await _todaysSnapshot(warehouseId);
    if (today != null) return today.listManufacturers();
    try {
      final response = await _apiClient.dio.get(Endpoints.warehouseManufacturers(warehouseId));
      final data = response.data as Map<String, dynamic>;
      OfflineStatus.instance.live();
      return (data['manufacturers'] as List).map(ManufacturerModel.fromJson).toList();
    } on DioException catch (e) {
      final failure = ServerFailure.fromDioError(e);
      if (_isConnectionFailure(failure)) {
        final snapshot = await _snapshotFor(warehouseId);
        if (snapshot != null) {
          OfflineStatus.instance.servedFromSavedCopy(snapshot.savedAt);
          return snapshot.listManufacturers();
        }
      }
      throw failure;
    }
  }

  /// Older servers can omit the probe; daily refresh remains compatible.
  Future<({String revision, int count})?> _revision(String warehouseId) async {
    try {
      final response = await _apiClient.dio.get('${Endpoints.warehouseProducts(warehouseId)}/revision');
      final data = response.data;
      if (data is! Map || data['revision'] is! String || data['productCount'] is! int) return null;
      return (revision: data['revision'] as String, count: data['productCount'] as int);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  @override
  Future<void> syncForOffline(String warehouseId, {bool force = false}) async {
    final store = _store;
    if (store == null || _syncing.containsKey(warehouseId)) return;
    final session = _session;
    _syncing[warehouseId] = session;
    bool current() => session == _session;
    CatalogSnapshot? existing;
    try {
      existing = await _snapshotFor(warehouseId);
      final before = await _revision(warehouseId);
      if (!current()) return;
      if (!force &&
          existing != null &&
          ((before != null && existing.revision == before.revision) ||
              (before == null && DailyRefresh.isCurrent(existing.savedAt)))) {
        return;
      }
      CatalogDownloadStatus.instance.set(
        warehouseId,
        CatalogDownloadEntry(
          CatalogDownloadPhase.downloading,
          savedAt: existing?.savedAt,
          productCount: existing?.products.length ?? 0,
        ),
      );
      final products = <Map<String, dynamic>>[];
      final ids = <String>{};
      final cursors = <String>{};
      String? after;
      var complete = false;
      for (var page = 0; page < _maxSyncPages; page++) {
        if (!current()) return;
        final response = await _apiClient.dio.get(
          Endpoints.warehouseProducts(warehouseId),
          queryParameters: {'limit': CatalogSnapshot.maxPageSize, if (after != null) 'after': after},
        );
        if (!current()) return;
        final data = response.data as Map<String, dynamic>;
        final rows = data['products'] as List;
        for (final row in rows) {
          if (row is! Map<String, dynamic> ||
              ProductModel.tryFromJson(row) == null ||
              row['id'] is! String ||
              !ids.add(row['id'] as String)) {
            throw const FormatException('Invalid or duplicated catalog row');
          }
          products.add(row);
        }
        final pagination = data['pagination'] as Map<String, dynamic>?;
        if (pagination == null || pagination['hasMore'] is! bool) {
          throw const FormatException('Missing catalog pagination');
        }
        if (pagination['hasMore'] == false) {
          complete = true;
          break;
        }
        final next = pagination['nextCursor'];
        if (next is! String || next.isEmpty || rows.isEmpty || !cursors.add(next)) {
          throw const FormatException('Incomplete catalog pagination');
        }
        after = next;
      }
      if (!complete || (before != null && before.count != products.length)) {
        throw const FormatException('Catalog download did not finish');
      }
      final manufacturersResponse = await _apiClient.dio.get(Endpoints.warehouseManufacturers(warehouseId));
      final manufacturers = ((manufacturersResponse.data as Map<String, dynamic>)['manufacturers'] as List)
          .cast<Object?>();
      final afterRevision = before == null ? null : await _revision(warehouseId);
      if (before != null && (afterRevision == null || afterRevision.revision != before.revision)) {
        throw const FormatException('Catalog changed during download');
      }
      if (!current()) return;
      final snapshot = CatalogSnapshot(
        warehouseId: warehouseId,
        savedAt: DateTime.now(),
        products: products,
        manufacturers: manufacturers,
        revision: before?.revision,
      );
      final saved = await store.writeConfirmed(
        _snapshotName(warehouseId),
        snapshot.toJson(),
        savedAt: snapshot.savedAt,
      );
      if (!current()) return;
      if (!saved) throw const FormatException('Catalog could not be saved');
      _snapshots[warehouseId] = snapshot;
      CatalogDownloadStatus.instance.set(
        warehouseId,
        CatalogDownloadEntry(CatalogDownloadPhase.saved, savedAt: snapshot.savedAt, productCount: products.length),
      );
      PermanentImageStore.instance.prefetch(products.map((row) => row['image']).whereType<String>(), framed: true);
      PermanentImageStore.instance.prefetch(
        manufacturers.whereType<Map>().map((row) => row['logoUrl']).whereType<String>(),
      );
    } catch (_) {
      if (current()) {
        CatalogDownloadStatus.instance.set(
          warehouseId,
          CatalogDownloadEntry(
            CatalogDownloadPhase.failed,
            savedAt: existing?.savedAt,
            productCount: existing?.products.length ?? 0,
          ),
        );
      }
      // Never replace a complete previous copy with a partial/failed download.
    } finally {
      if (_syncing[warehouseId] == session) _syncing.remove(warehouseId);
    }
  }
}
