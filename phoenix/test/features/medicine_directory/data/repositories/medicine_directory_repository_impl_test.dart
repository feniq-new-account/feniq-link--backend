import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/core/offline/offline_store.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository_impl.dart';

class MockApiClient extends Mock implements ApiClient {}

class MockDio extends Mock implements Dio {}

Response<dynamic> _ok(Object data) =>
    Response(data: data, statusCode: 200, requestOptions: RequestOptions(path: ''));

DioException _offline() =>
    DioException.connectionError(requestOptions: RequestOptions(path: ''), reason: 'no route to host');

Map<String, dynamic> _row(String id, String nameAr, {bool? active}) => {
  'id': id,
  'nameAr': nameAr,
  'manufacturerAr': 'ألفا',
  'updatedAt': '2026-10-04T10:00:00.000Z',
  if (active != null) 'isActive': active,
};

void main() {
  late MockApiClient apiClient;
  late MockDio dio;
  late Directory dir;
  late OfflineStore store;
  late SessionScope scope;
  late MedicineDirectoryRepositoryImpl repository;
  final requests = <Map<String, dynamic>?>[];

  MedicineDirectoryRepositoryImpl build() =>
      MedicineDirectoryRepositoryImpl(apiClient: apiClient, offlineStore: store, sessionScope: scope);

  /// Serves [pages] one after the other, the way the server's cursor works.
  void serve(List<List<Map<String, dynamic>>> pages, {String serverTime = '2026-10-04T10:00:00.000Z', int? total}) {
    when(() => dio.get(any(), queryParameters: any(named: 'queryParameters'))).thenAnswer((invocation) async {
      final query = invocation.namedArguments[#queryParameters] as Map<String, dynamic>?;
      requests.add(query);
      final after = query?['after'] as String?;
      final index = after == null ? 0 : int.parse(after);
      final last = index >= pages.length - 1;
      return _ok({
        'success': true,
        'serverTime': serverTime,
        'items': pages[index],
        'pagination': {
          'hasMore': !last,
          'nextCursor': last ? null : '${index + 1}',
          if (after == null) 'total': total ?? pages.fold<int>(0, (sum, page) => sum + page.length),
        },
      });
    });
  }

  setUp(() async {
    apiClient = MockApiClient();
    dio = MockDio();
    when(() => apiClient.dio).thenReturn(dio);
    dir = await Directory.systemTemp.createTemp('feniq_directory_test');
    store = OfflineStore(directoryProvider: () async => Directory('${dir.path}/offline'));
    scope = SessionScope();
    repository = build();
    requests.clear();
  });

  tearDown(() async {
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  test('with nothing saved, load finds nothing', () async {
    expect(await repository.load(), isNull);
    expect(repository.current, isNull);
  });

  test('the first sync downloads every page, reports progress, and keeps the list sorted by name', () async {
    serve([
      [_row('1', 'ب'), _row('2', 'أ')],
      [_row('3', 'ج')],
    ]);
    final progress = <String>[];
    final outcome = await repository.sync(onProgress: (loaded, total) => progress.add('$loaded/$total'));

    expect(outcome, DirectorySyncOutcome.downloaded);
    expect(progress, ['2/3', '3/3']);
    expect(repository.current!.items.map((i) => i.nameAr), ['أ', 'ب', 'ج']);
    expect(requests.first, containsPair('limit', MedicineDirectoryRepositoryImpl.pageSize));
    expect(requests.first!.containsKey('since'), isFalse, reason: 'a first download asks for everything');
  });

  test('a phone restarted offline reads the list back from disk', () async {
    serve([
      [_row('1', 'أ'), _row('2', 'ب')],
    ]);
    await repository.sync();

    final restarted = build();
    final directory = await restarted.load();
    expect(directory!.length, 2);
    expect(directory.serverTime, '2026-10-04T10:00:00.000Z');
  });

  test('a recent copy is not downloaded again; force asks only for what changed', () async {
    serve([
      [_row('1', 'أ'), _row('2', 'ب')],
    ]);
    await repository.sync();
    requests.clear();

    expect(await repository.sync(), DirectorySyncOutcome.upToDate);
    expect(requests, isEmpty);

    serve([
      [_row('2', 'ب معدّل'), _row('1', 'أ', active: false), _row('3', 'ج')],
    ], serverTime: '2026-10-04T12:00:00.000Z');
    expect(await repository.sync(force: true), DirectorySyncOutcome.updated);

    expect(requests.single!['since'], '2026-10-04T09:58:00.000Z', reason: 'the saved server time, minus the two minute overlap');
    expect(repository.current!.items.map((i) => i.nameAr), ['ب معدّل', 'ج']);
    expect(repository.current!.serverTime, '2026-10-04T12:00:00.000Z');
  });

  test('a copy older than the full-refresh age is downloaded again, not patched', () async {
    serve([
      [_row('1', 'أ')],
    ]);
    await repository.sync();
    // Make the saved copy look three weeks old.
    final entry = await store.read('medicine_directory');
    await store.write('medicine_directory', entry!.data, savedAt: DateTime.now().subtract(const Duration(days: 21)));
    final restarted = build();
    requests.clear();
    serve([
      [_row('2', 'ب')],
    ]);

    expect(await restarted.sync(), DirectorySyncOutcome.downloaded);
    expect(requests.first!.containsKey('since'), isFalse);
    expect(restarted.current!.items.map((i) => i.id), ['2'], reason: 'what the server no longer sends is gone');
  });

  test('with no connection the sync fails with a network failure and the saved copy stays', () async {
    serve([
      [_row('1', 'أ')],
    ]);
    await repository.sync();

    when(() => dio.get(any(), queryParameters: any(named: 'queryParameters'))).thenThrow(_offline());
    await expectLater(
      repository.sync(force: true),
      throwsA(isA<ServerFailure>().having((f) => f.code, 'code', FailureCode.network)),
    );
    expect(repository.current!.length, 1);
    expect((await build().load())!.length, 1);
  });

  test('a sign-out forgets the list in memory', () async {
    serve([
      [_row('1', 'أ')],
    ]);
    await repository.sync();
    scope.resetAll();
    expect(repository.current, isNull);
  });

  test('two screens asking at once share one download', () async {
    serve([
      [_row('1', 'أ')],
    ]);
    final results = await Future.wait([repository.sync(), repository.sync()]);
    expect(results, [DirectorySyncOutcome.downloaded, DirectorySyncOutcome.downloaded]);
    expect(requests, hasLength(1));
  });
}
