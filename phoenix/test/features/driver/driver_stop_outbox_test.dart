import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/driver/data/driver_stop_outbox.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';

class MemoryDriverOutboxStore implements DriverStopOutboxStore {
  final Map<String, List<PendingDriverStop>> saved = {};
  bool rejectWrites = false;
  @override
  Future<List<PendingDriverStop>> read(String accountId) async =>
      List.of(saved[accountId] ?? const []);
  @override
  Future<void> write(String accountId, List<PendingDriverStop> commands) async {
    if (rejectWrites) throw StateError('Secure storage not available');
    saved[accountId] = List.of(commands);
  }
}

class FakeDriverStopRepository implements DriverTripRepository {
  bool networkDown = false;
  bool completed = false;
  final List<String?> requests = [];
  @override
  Future<DriverTrip> updateStop(String tripId, String stopId, int revision,
      {required String status, String note = '', String? requestId}) async {
    requests.add(requestId);
    if (networkDown) throw StateError('Connection lost');
    return DriverTrip(
      id: tripId, region: 'Kasab', serviceDate: DateTime.utc(2026, 11, 6),
      status: completed ? 'completed' : 'in_progress', revision: revision + 1,
      stops: [DriverTripStop(id: stopId, pharmacyName: 'Pharmacy',
        address: 'Road', status: status, note: note)],
    );
  }
  @override
  Future<List<DriverTrip>> listTrips() async => [];
  @override
  Future<DriverTrip> start(String tripId, int revision) => throw UnimplementedError();
  @override
  Future<DriverTrip> complete(String tripId, int revision) => throw UnimplementedError();
  @override
  Future<void> sendLocation(String tripId, DeviceLocation location) async {}
}

void main() {
  test('persists before send, retries same ID after restart, then removes only on ACK', () async {
    final store = MemoryDriverOutboxStore();
    final repo = FakeDriverStopRepository()..networkDown = true;
    final first = DriverStopOutbox(accountId: 'user-A', repository: repo, store: store);
    await first.restore();
    final original = await first.enqueue(tripId: 'trip-1', stopId: 'stop-1',
      revision: 7, status: 'delivered');
    expect(store.saved['user-A'], hasLength(1));
    expect(original.requestId.length, greaterThanOrEqualTo(12));
    final failed = await first.flush();
    expect(failed.allSynced, false);
    expect(first.pending, hasLength(1));

    // New widget/app session reads persisted ciphertext through the same store.
    final restarted = DriverStopOutbox(accountId: 'user-A', repository: repo, store: store);
    await restarted.restore();
    expect(restarted.pending.single.requestId, original.requestId);
    repo.networkDown = false;
    final done = await restarted.flush();
    expect(done.allSynced, true);
    expect(done.confirmed, 1);
    expect(restarted.pending, isEmpty);
    expect(store.saved['user-A'], isEmpty);
    expect(repo.requests, [original.requestId, original.requestId]);
  });

  test('pending decisions cannot cross user identities on a shared phone', () async {
    final store = MemoryDriverOutboxStore();
    final repo = FakeDriverStopRepository();
    final a = DriverStopOutbox(accountId: 'user-A', repository: repo, store: store);
    await a.restore();
    await a.enqueue(tripId: 'trip-1', stopId: 'stop-1',
      revision: 0, status: 'delivered');
    final b = DriverStopOutbox(accountId: 'user-B', repository: repo, store: store);
    await b.restore();
    expect(b.pending, isEmpty);
    expect(a.pending, hasLength(1));
    await b.enqueue(tripId: 'trip-2', stopId: 'stop-2',
      revision: 0, status: 'failed', note: 'Shop closed');
    expect(store.saved['user-A']?.single.tripId, 'trip-1');
    expect(store.saved['user-B']?.single.tripId, 'trip-2');
  });

  test('a failed durable write never sends an unrecorded stop', () async {
    final store = MemoryDriverOutboxStore()..rejectWrites = true;
    final repo = FakeDriverStopRepository();
    final outbox = DriverStopOutbox(accountId: 'user-A', repository: repo, store: store);
    await outbox.restore();
    await expectLater(outbox.enqueue(tripId: 'trip-1', stopId: 'stop-1',
      revision: 0, status: 'delivered'), throwsStateError);
    expect(repo.requests, isEmpty);
    expect(outbox.pending, isEmpty);
  });

  test('one unresolved stop per trip prevents stale-revision double submissions', () async {
    final store = MemoryDriverOutboxStore();
    final repo = FakeDriverStopRepository();
    final outbox = DriverStopOutbox(accountId: 'user-A', repository: repo, store: store);
    await outbox.restore();
    await outbox.enqueue(tripId: 'trip-1', stopId: 'stop-1',
      revision: 4, status: 'delivered');
    await expectLater(outbox.enqueue(tripId: 'trip-1', stopId: 'stop-2',
      revision: 4, status: 'delivered'), throwsStateError);
    expect(outbox.pending, hasLength(1));
  });

  test('an acknowledged replay after completion clears the persisted command', () async {
    final store = MemoryDriverOutboxStore();
    final repo = FakeDriverStopRepository()..completed = true;
    final outbox = DriverStopOutbox(accountId: 'user-A', repository: repo, store: store);
    await outbox.restore();
    await outbox.enqueue(tripId: 'trip-1', stopId: 'stop-1', revision: 3,
      status: 'failed', note: 'Pharmacy closed');
    expect((await outbox.flush()).allSynced, true);
    expect(outbox.pending, isEmpty);
  });

  test('a server conflict leaves the original command untouched for manual review', () async {
    final store = MemoryDriverOutboxStore();
    final repo = FakeDriverStopRepository()..networkDown = true;
    final outbox = DriverStopOutbox(accountId: 'user-A', repository: repo, store: store);
    await outbox.restore();
    final command = await outbox.enqueue(tripId: 'trip-1', stopId: 'stop-1',
      revision: 2, status: 'delivered');
    final result = await outbox.flush();
    expect(result.allSynced, false);
    expect(store.saved['user-A']!.single.requestId, command.requestId);
    expect(outbox.pending.single.revision, 2);
  });

  test('command JSON serialization rejects malformed or corrupted stop payloads', () {
    final now = DateTime.now().toUtc();
    final original = PendingDriverStop(
      tripId: 'trip-1', stopId: 'stop-1', revision: 2, status: 'failed',
      note: 'Unavailable', requestId: 'idempotent-request-20261106', recordedAt: now,
    );
    expect(PendingDriverStop.fromJson(original.toJson()).requestId, original.requestId);
    expect(() => PendingDriverStop.fromJson({
      ...original.toJson(), 'status': 'paid',
    }), throwsFormatException);
    expect(() => PendingDriverStop.fromJson({
      ...original.toJson(), 'requestId': 'bad key',
    }), throwsFormatException);
  });
}
