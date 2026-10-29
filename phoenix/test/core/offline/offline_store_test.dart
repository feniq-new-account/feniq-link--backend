import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/offline/offline_store.dart';

void main() {
  late Directory dir;
  late OfflineStore store;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('feniq_offline_test');
    store = OfflineStore(directoryProvider: () async => Directory('${dir.path}/offline'));
  });

  tearDown(() async {
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  test('writes a document and reads it back with the time it was saved', () async {
    final savedAt = DateTime.utc(2026, 10, 4, 9, 30);
    await store.write('catalog_w1', {
      'products': [1, 2, 3],
    }, savedAt: savedAt);
    final entry = await store.read('catalog_w1');
    expect(entry, isNotNull);
    expect(entry!.savedAt.toUtc(), savedAt);
    expect((entry.data as Map)['products'], [1, 2, 3]);
  });

  test('a document that was never saved reads as null', () async {
    expect(await store.read('nothing'), isNull);
  });

  test('a damaged file reads as null instead of throwing', () async {
    await store.write('broken', {'a': 1});
    final file = File('${dir.path}/offline/broken.json');
    await file.writeAsString('{ not json');
    expect(await store.read('broken'), isNull);
  });

  test('names with odd characters stay inside the folder', () async {
    await store.write('../escape/me', {'a': 1});
    expect(await store.read('../escape/me'), isNotNull);
    expect(File('${dir.path}/escape/me.json').existsSync(), isFalse);
  });

  test('a large document survives the trip', () async {
    final rows = List.generate(3000, (i) => {'id': 'p$i', 'nameAr': 'دواء $i' * 3});
    await store.write('big', {'products': rows});
    final entry = await store.read('big');
    expect(((entry!.data as Map)['products'] as List).length, 3000);
  });

  test('clear forgets everything', () async {
    await store.write('a', {'x': 1});
    await store.write('b', {'x': 2});
    await store.clear();
    expect(await store.read('a'), isNull);
    expect(await store.read('b'), isNull);
  });
  test('a queued write cannot resurrect data after sign-out deletion', () async {
    final write = store.writeConfirmed('old', {'account': 'previous'});
    final clear = store.clear();
    await Future.wait([write, clear]);
    expect(await store.read('old'), isNull);
    expect(await store.writeConfirmed('new', {'account': 'current'}), isTrue);
    expect((await store.read('new'))!.data, {'account': 'current'});
  });

  test('a disk failure is reported instead of claiming offline readiness', () async {
    final unavailable = OfflineStore(directoryProvider: () async => throw const FileSystemException('full'));
    expect(await unavailable.writeConfirmed('catalog', {'products': []}), isFalse);
  });
}
