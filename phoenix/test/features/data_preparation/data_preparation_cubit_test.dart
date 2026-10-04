import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feniq/core/constants/storage_keys.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/offline/offline_syncable.dart';
import 'package:feniq/core/services/storage_service.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_cubit.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_state.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';

class _FakeDirectory implements MedicineDirectoryRepository {
  MedicineDirectory? saved;
  Failure? failure;
  int syncs = 0;
  final totals = <int>[];

  @override
  MedicineDirectory? get current => saved;

  @override
  Future<MedicineDirectory?> load() async => saved;

  @override
  Future<DirectorySyncOutcome> sync({bool force = false, void Function(int loaded, int total)? onProgress}) async {
    syncs++;
    final error = failure;
    if (error != null) throw error;
    onProgress?.call(500, 1000);
    onProgress?.call(1000, 1000);
    saved = MedicineDirectory(rows: [indexDirectoryRow({'id': '1', 'nameAr': 'أ', 'manufacturerAr': 'ب'})], savedAt: DateTime.now());
    return DirectorySyncOutcome.downloaded;
  }
}

class _MockWarehouses extends Mock implements WarehouseRepository {}

class _MockCatalog extends Mock implements CatalogRepository, OfflineSyncable {}

WarehouseModel _warehouse(String id) =>
    WarehouseModel(id: id, nameAr: 'مستودع $id', nameEn: 'Warehouse $id', city: 'دمشق', phone: '0944000000');

void main() {
  late _FakeDirectory directory;
  late _MockWarehouses warehouses;
  late _MockCatalog catalog;
  late StorageService storage;
  late SessionScope scope;
  final synced = <String>[];

  Future<DataPreparationCubit> build({bool prepared = false, int maxWarehouses = 10}) async {
    SharedPreferences.setMockInitialValues({
      if (prepared) StorageKeys.dataPreparedAt: DateTime(2026, 10, 3).toIso8601String(),
    });
    storage = StorageService(await SharedPreferences.getInstance());
    return DataPreparationCubit(
      directoryRepository: directory,
      warehouseRepository: warehouses,
      catalogRepository: catalog,
      storageService: storage,
      sessionScope: scope,
      doneLinger: Duration.zero,
      maxWarehouses: maxWarehouses,
    );
  }

  setUp(() {
    directory = _FakeDirectory();
    warehouses = _MockWarehouses();
    catalog = _MockCatalog();
    scope = SessionScope();
    synced.clear();
    when(() => warehouses.getWarehouses(onlyMyCity: true)).thenAnswer(
      (_) async => WarehouseListResult(warehouses: [_warehouse('w1')], cityFilterApplied: true),
    );
    when(() => warehouses.getWarehouses(onlyMyCity: false)).thenAnswer(
      (_) async => WarehouseListResult(warehouses: [_warehouse('w1'), _warehouse('w2')], cityFilterApplied: false),
    );
    when(() => catalog.syncForOffline(any(), force: any(named: 'force'), onProgress: any(named: 'onProgress'))).thenAnswer((
      invocation,
    ) async {
      synced.add(invocation.positionalArguments.first as String);
      (invocation.namedArguments[#onProgress] as void Function(int)?)?.call(1200);
      return true;
    });
  });

  test('a fresh phone starts "pending" with the full-screen page due', () async {
    final cubit = await build();
    expect(cubit.state.status, PreparationStatus.pending);
    expect(cubit.state.firstRun, isTrue);
    expect(cubit.state.showsOverlay, isTrue);
    await cubit.close();
  });

  test('the first run downloads the directory then every warehouse, shows progress, and remembers it is done', () async {
    final cubit = await build();
    final seen = <DataPreparationState>[];
    cubit.stream.listen(seen.add);

    await cubit.start();

    expect(directory.syncs, 1);
    expect(synced, ['w1', 'w2'], reason: 'own city first, then the rest');
    expect(seen.any((s) => s.status == PreparationStatus.running && s.directoryTotal == 1000), isTrue);
    expect(seen.any((s) => s.step == PreparationStep.warehouses && s.warehouseName == 'مستودع w2' && s.warehouseCount == 2), isTrue);
    expect(seen.any((s) => s.status == PreparationStatus.done && s.fraction == 1), isTrue);
    final fractions = seen.where((s) => s.status == PreparationStatus.running).map((s) => s.fraction).toList();
    expect(fractions, orderedEquals([...fractions]..sort()), reason: 'the bar never goes backwards');
    expect(cubit.state.status, PreparationStatus.idle);
    expect(cubit.state.firstRun, isFalse);
    expect(storage.getString(StorageKeys.dataPreparedAt), isNotNull);
    await cubit.close();
  });

  test('only maxWarehouses are downloaded up front', () async {
    final cubit = await build(maxWarehouses: 1);
    await cubit.start();
    expect(synced, ['w1']);
    await cubit.close();
  });

  test('a phone that has done it before works silently - never an overlay', () async {
    final cubit = await build(prepared: true);
    expect(cubit.state.status, PreparationStatus.idle);
    final seen = <DataPreparationState>[];
    cubit.stream.listen(seen.add);

    await cubit.start();

    expect(directory.syncs, 1);
    expect(synced, ['w1', 'w2']);
    expect(seen.where((s) => s.showsOverlay), isEmpty);
    await cubit.close();
  });

  test('a quiet re-run right after the last one is skipped, a forced one is not', () async {
    final cubit = await build(prepared: true);
    await cubit.start();
    await cubit.start();
    expect(directory.syncs, 1);
    await cubit.start(force: true);
    expect(directory.syncs, 2);
    await cubit.close();
  });

  test('first run with no connection and nothing saved: failed with the network code, and "continue" lets the pharmacist in', () async {
    directory.failure = ServerFailure('offline', code: FailureCode.network);
    final cubit = await build();

    await cubit.start();

    expect(cubit.state.status, PreparationStatus.failed);
    expect(cubit.state.errorCode, FailureCode.network);
    expect(cubit.state.showsOverlay, isTrue);
    expect(synced, isEmpty);

    await cubit.skip();
    expect(cubit.state.showsOverlay, isFalse);
    expect(storage.getString(StorageKeys.dataPreparedAt), isNotNull);
    await cubit.close();
  });

  test('trying again after a failure runs it all', () async {
    directory.failure = ServerFailure('offline', code: FailureCode.network);
    final cubit = await build();
    await cubit.start();
    expect(cubit.state.status, PreparationStatus.failed);

    directory.failure = null;
    await cubit.start(force: true);

    expect(cubit.state.status, PreparationStatus.idle);
    expect(cubit.state.firstRun, isFalse);
    expect(synced, ['w1', 'w2']);
    await cubit.close();
  });

  test('offline with a copy already on the phone is not an error: the old copy serves', () async {
    directory.saved = MedicineDirectory(rows: const [], savedAt: DateTime(2026, 10, 1));
    directory.failure = ServerFailure('offline', code: FailureCode.network);
    when(() => warehouses.getWarehouses(onlyMyCity: any(named: 'onlyMyCity'))).thenThrow(ServerFailure('offline', code: FailureCode.network));
    final cubit = await build(prepared: true);

    await cubit.start();

    expect(cubit.state.status, PreparationStatus.idle);
    expect(cubit.state.showsOverlay, isFalse);
    await cubit.close();
  });

  test('first run: a warehouse that could not be saved is a failure the pharmacist can retry', () async {
    when(() => catalog.syncForOffline('w2', force: any(named: 'force'), onProgress: any(named: 'onProgress'))).thenAnswer((_) async => false);
    final cubit = await build();

    await cubit.start();

    expect(cubit.state.status, PreparationStatus.failed);
    expect(storage.getString(StorageKeys.dataPreparedAt), isNull, reason: 'not marked done, so the next launch tries again');
    await cubit.close();
  });

  test('a sign-out puts the next account back to the first-run state', () async {
    final cubit = await build();
    await cubit.start();
    expect(cubit.state.firstRun, isFalse);

    scope.resetAll();
    await Future<void>.delayed(Duration.zero);

    expect(cubit.state.status, PreparationStatus.pending);
    expect(cubit.state.firstRun, isTrue);
    expect(storage.getString(StorageKeys.dataPreparedAt), isNull);
    await cubit.close();
  });
}
