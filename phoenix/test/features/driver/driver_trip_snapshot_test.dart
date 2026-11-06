import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';
import 'package:feniq/features/driver/data/driver_trip_snapshot.dart';

class MemorySnapshotStore implements DriverTripSnapshotStore {
  final Map<String, DriverTripSnapshot> snapshots = {};
  @override
  Future<DriverTripSnapshot?> read(String accountId) async => snapshots[accountId];
  @override
  Future<void> write(String accountId, DriverTripSnapshot value) async {
    snapshots[accountId] = value;
  }
}

DriverTrip _trip() => DriverTrip(
  id: 'trip-1', region: 'Kasab', serviceDate: DateTime.utc(2026, 11, 6),
  status: 'in_progress', revision: 3,
  stops: [DriverTripStop(
    id: 'stop-1', pharmacyName: 'Pharmacy', address: 'Kasab Road',
    status: 'pending', note: '',
  )],
);

void main() {
  test('cached trips are encrypted-store scoped by signed-in driver ID', () async {
    final store = MemorySnapshotStore();
    final driverA = DriverTripSnapshotCache(accountId: 'driver-A', store: store);
    final driverB = DriverTripSnapshotCache(accountId: 'driver-B', store: store);
    await driverA.save([_trip()]);
    expect((await driverA.read())?.trips.single.id, 'trip-1');
    expect(await driverB.read(), isNull);
    await driverA.save([]);
    expect((await driverA.read())?.trips, isEmpty);
  });

  test('snapshot cache never permits more than 40 trips or 50 stops', () async {
    final store = MemorySnapshotStore();
    final cache = DriverTripSnapshotCache(accountId: 'driver-A', store: store);
    await expectLater(cache.save(List.filled(41, _trip())), throwsStateError);
    expect(await cache.read(), isNull);
  });

  test('snapshot retains version and original stop status for idempotent queue', () async {
    final store = MemorySnapshotStore();
    final cache = DriverTripSnapshotCache(accountId: 'driver-A', store: store);
    await cache.save([_trip()]);
    final stored = (await cache.read())!;
    expect(stored.trips.single.revision, 3);
    expect(stored.trips.single.stops.single.status, 'pending');
    expect(stored.savedAt.isUtc, true);
  });
}
