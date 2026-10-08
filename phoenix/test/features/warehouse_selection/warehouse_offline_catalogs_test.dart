import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/offline/offline_syncable.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/features/warehouse_selection/presentation/managers/warehouse_selection_cubit.dart';
import 'package:feniq/features/warehouse_selection/presentation/managers/warehouse_selection_state.dart';

class _MockWarehouseRepository extends Mock implements WarehouseRepository {}

// Records the catalogs it was asked to keep; [gate] holds each download open
// until the test lets it finish.
class _FakeOfflineCatalogs implements OfflineSyncable {
  final List<String> synced = [];
  Completer<void>? gate;

  @override
  Future<void> syncForOffline(String warehouseId, {bool force = false}) async {
    synced.add(warehouseId);
    await gate?.future;
  }
}

WarehouseModel _warehouse(String id) =>
    WarehouseModel(id: id, nameAr: 'مستودع $id', nameEn: id, city: 'Latakia', phone: '0940000001', logo: null);

void main() {
  late _MockWarehouseRepository repository;
  late _FakeOfflineCatalogs offline;

  setUp(() {
    repository = _MockWarehouseRepository();
    offline = _FakeOfflineCatalogs();
    when(() => repository.getWarehouses(onlyMyCity: any(named: 'onlyMyCity'))).thenAnswer(
      (_) async => WarehouseListResult(warehouses: [_warehouse('w1'), _warehouse('w2'), _warehouse('w3')], cityFilterApplied: false),
    );
  });

  test('every listed warehouse is kept on the phone, one after another, without holding the list', () async {
    final cubit = WarehouseSelectionCubit(warehouseRepository: repository, offlineCatalogs: offline);
    await cubit.loadWarehouses();
    expect(cubit.state.status, WarehouseListStatus.loaded);
    await pumpEventQueue();
    expect(offline.synced, ['w1', 'w2', 'w3']);
  });

  test('a sign-out stops the downloads for the previous account', () async {
    offline.gate = Completer<void>();
    final cubit = WarehouseSelectionCubit(warehouseRepository: repository, offlineCatalogs: offline);
    await cubit.loadWarehouses();
    await pumpEventQueue();
    expect(offline.synced, ['w1']);
    cubit.resetForSignOut();
    offline.gate!.complete();
    await pumpEventQueue();
    expect(offline.synced, ['w1']);
  });
}
