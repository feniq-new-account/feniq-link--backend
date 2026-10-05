import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/offline/daily_refresh.dart';
import 'package:feniq/core/offline/offline_status.dart';
import 'package:feniq/core/offline/offline_store.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository_impl.dart';

class MockApiClient extends Mock implements ApiClient {}

class MockDio extends Mock implements Dio {}

Map<String, dynamic> _product(String id, String nameAr, {String? ingredient, String manufacturer = 'ألفا'}) => {
  'id': id,
  'nameAr': nameAr,
  'manufacturerAr': manufacturer,
  'priceUsd': 5,
  'discountPriceUsd': 5,
  'isAvailable': true,
  'offer': null,
  'activeIngredient': ingredient,
  'strength': ingredient == null ? null : '500 MG/TAB.',
  'dosageForm': ingredient == null ? null : 'أقراص',
};

Response<dynamic> _ok(Object data) =>
    Response(data: data, statusCode: 200, requestOptions: RequestOptions(path: ''));

DioException _offline() => DioException.connectionError(
  requestOptions: RequestOptions(path: ''),
  reason: 'no route to host',
);

DioException _serverError() => DioException.badResponse(
  statusCode: 500,
  requestOptions: RequestOptions(path: ''),
  response: Response(data: {'message': 'boom'}, statusCode: 500, requestOptions: RequestOptions(path: '')),
);

void main() {
  late MockApiClient apiClient;
  late MockDio dio;
  late Directory dir;
  late OfflineStore store;
  late CatalogRepositoryImpl repository;

  // Both pages of the warehouse's catalog, then its companies, as the server sends them.
  Future<Response<dynamic>> answer(Invocation invocation) async {
    final path = invocation.positionalArguments.first as String;
    final query = invocation.namedArguments[#queryParameters] as Map<String, dynamic>?;
    if (path.endsWith('/manufacturers')) {
      return _ok({
        'manufacturers': [
          {'manufacturerAr': 'ألفا', 'discountPercentage': 2},
        ],
      });
    }
    if (query?['after'] == null) {
      return _ok({
        'products': [
          _product('p1', 'PANADOL 500', ingredient: 'PARACETAMOL'),
          _product('p2', 'CETAMOL 500', ingredient: 'PARACETAMOL'),
        ],
        'pagination': {'hasMore': true, 'nextCursor': 'p2'},
      });
    }
    return _ok({
      'products': [_product('p3', 'BRUFEN 400', ingredient: 'IBUPROFEN')],
      'pagination': {'hasMore': false, 'nextCursor': 'p3'},
    });
  }

  void serveCatalog() {
    when(() => dio.get(any(), queryParameters: any(named: 'queryParameters'))).thenAnswer(answer);
    // The company list is requested with no query at all.
    when(() => dio.get(any())).thenAnswer(answer);
  }

  // Makes the saved copy yesterday's (taken before today's cutoff), with a
  // repository that has not read it yet - so calls go to the server again.
  Future<void> ageSavedCopy() async {
    final entry = (await store.read('catalog_w1'))!;
    await store.write('catalog_w1', entry.data, savedAt: DailyRefresh.lastCutoff().subtract(const Duration(hours: 1)));
    repository = CatalogRepositoryImpl(apiClient: apiClient, offlineStore: store);
  }

  void goOffline([DioException? error]) {
    when(() => dio.get(any(), queryParameters: any(named: 'queryParameters'))).thenThrow(error ?? _offline());
    when(() => dio.get(any())).thenThrow(error ?? _offline());
  }

  setUp(() async {
    apiClient = MockApiClient();
    dio = MockDio();
    when(() => apiClient.dio).thenReturn(dio);
    dir = await Directory.systemTemp.createTemp('feniq_catalog_offline_test');
    store = OfflineStore(directoryProvider: () async => Directory('${dir.path}/offline'));
    repository = CatalogRepositoryImpl(apiClient: apiClient, offlineStore: store);
    OfflineStatus.instance.live();
  });

  tearDown(() async {
    OfflineStatus.instance.live();
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  group('with a saved copy of the warehouse', () {
    setUp(() async {
      serveCatalog();
      await repository.syncForOffline('w1');
    });

    test('the download takes every page and the company list', () async {
      final entry = await store.read('catalog_w1');
      expect(entry, isNotNull);
      final data = entry!.data as Map;
      expect((data['products'] as List).length, 3);
      expect((data['manufacturers'] as List).length, 1);
    });

    test('products are served from the saved copy when there is no connection', () async {
      await ageSavedCopy();
      goOffline();
      final page = await repository.getProducts(warehouseId: 'w1', search: 'paracetamol');
      expect(page.items.map((p) => p.id), ['p1', 'p2']);
      expect(OfflineStatus.instance.cachedSince.value, isNotNull);
    });

    test('a phone restarted offline reads the copy from disk', () async {
      goOffline();
      final fresh = CatalogRepositoryImpl(apiClient: apiClient, offlineStore: store);
      final page = await fresh.getProducts(warehouseId: 'w1', manufacturer: 'ألفا', limit: 2);
      expect(page.items.map((p) => p.id), ['p1', 'p2']);
      expect(page.hasMore, isTrue);
      final next = await fresh.getProducts(warehouseId: 'w1', manufacturer: 'ألفا', limit: 2, after: page.nextCursor);
      expect(next.items.map((p) => p.id), ['p3']);
    });

    test('the companies and the alternatives work offline too', () async {
      goOffline();
      final manufacturers = await repository.getManufacturers(warehouseId: 'w1');
      expect(manufacturers.map((m) => m.name), ['ألفا']);
      final alternatives = await repository.getAlternatives(warehouseId: 'w1', productId: 'p1');
      expect(alternatives.map((p) => p.id), ['p2']);
    });

    test('a real answer from the server is not replaced by the saved copy', () async {
      await ageSavedCopy();
      goOffline(_serverError());
      await expectLater(
        repository.getProducts(warehouseId: 'w1'),
        throwsA(isA<ServerFailure>().having((f) => f.statusCode, 'statusCode', 500)),
      );
      expect(OfflineStatus.instance.cachedSince.value, isNull);
    });

    test('the next successful call from the server clears the offline notice', () async {
      await ageSavedCopy();
      goOffline();
      await repository.getProducts(warehouseId: 'w1');
      expect(OfflineStatus.instance.cachedSince.value, isNotNull);
      serveCatalog();
      await repository.getProducts(warehouseId: 'w1');
      expect(OfflineStatus.instance.cachedSince.value, isNull);
    });

    test("today's copy is read from the phone: no request, no offline notice", () async {
      clearInteractions(dio);
      final fresh = CatalogRepositoryImpl(apiClient: apiClient, offlineStore: store);
      final page = await fresh.getProducts(warehouseId: 'w1', search: 'paracetamol');
      expect(page.items.map((p) => p.id), ['p1', 'p2']);
      final manufacturers = await fresh.getManufacturers(warehouseId: 'w1');
      expect(manufacturers.map((m) => m.name), ['ألفا']);
      verifyNever(() => dio.get(any(), queryParameters: any(named: 'queryParameters')));
      verifyNever(() => dio.get(any()));
      expect(OfflineStatus.instance.cachedSince.value, isNull);
    });

    test("yesterday's copy goes back to the server, and is downloaded again", () async {
      await ageSavedCopy();
      clearInteractions(dio);
      await repository.getProducts(warehouseId: 'w1');
      verify(() => dio.get(any(), queryParameters: any(named: 'queryParameters'))).called(1);
      await repository.syncForOffline('w1');
      final entry = await store.read('catalog_w1');
      expect(DailyRefresh.isCurrent(entry!.savedAt), isTrue);
    });

    test('a recent copy is not downloaded again', () async {
      clearInteractions(dio);
      await repository.syncForOffline('w1');
      verifyNever(() => dio.get(any(), queryParameters: any(named: 'queryParameters')));
    });

    test('a different warehouse has no copy to fall back on', () async {
      goOffline();
      await expectLater(
        repository.getProducts(warehouseId: 'w2'),
        throwsA(isA<ServerFailure>().having((f) => f.code, 'code', FailureCode.network)),
      );
    });

    test('signing out forgets the saved copies', () async {
      final scope = SessionScope();
      final scoped = CatalogRepositoryImpl(apiClient: apiClient, sessionScope: scope, offlineStore: store);
      scope.resetAll();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      goOffline();
      await expectLater(scoped.getProducts(warehouseId: 'w1'), throwsA(isA<ServerFailure>()));
      expect(await store.read('catalog_w1'), isNull);
    });
  });

  test('without a saved copy the connection error is shown as before', () async {
    goOffline();
    await expectLater(
      repository.getProducts(warehouseId: 'w1'),
      throwsA(isA<ServerFailure>().having((f) => f.code, 'code', FailureCode.network)),
    );
  });

  group('the daily cutoff', () {
    test('is 05:00 today once it has passed, else 05:00 yesterday', () {
      expect(DailyRefresh.lastCutoff(DateTime(2026, 10, 5, 9)), DateTime(2026, 10, 5, 5));
      expect(DailyRefresh.lastCutoff(DateTime(2026, 10, 5, 4, 59)), DateTime(2026, 10, 4, 5));
      expect(DailyRefresh.isCurrent(DateTime(2026, 10, 5, 5, 1), DateTime(2026, 10, 5, 23)), isTrue);
      expect(DailyRefresh.isCurrent(DateTime(2026, 10, 5, 4), DateTime(2026, 10, 5, 23)), isFalse);
    });
  });

  test('a failed download leaves no copy and does not throw', () async {
    goOffline();
    await repository.syncForOffline('w1');
    expect(await store.read('catalog_w1'), isNull);
  });
}
