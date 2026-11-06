import 'dart:async';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';
import 'package:feniq/features/driver/data/driver_position_stream.dart';
import 'package:feniq/features/driver/data/driver_stop_outbox.dart';
import 'package:feniq/features/driver/data/driver_trip_snapshot.dart';
import 'package:feniq/features/driver/presentation/driver_trips_tab.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';

class FakeDriverRepository implements DriverTripRepository {
  FakeDriverRepository(this.trips);
  List<DriverTrip> trips;
  int fetches = 0;
  int starts = 0;
  int deliveries = 0;
  int finishes = 0;
  int gpsSends = 0;
  Object? gpsSendError;
  bool stopNetworkFails = false;
  Object? tripLoadError;
  final List<String?> stopRequestIds = [];
  @override
  Future<void> sendLocation(String tripId, DeviceLocation fix) async {
    if (gpsSendError != null) throw gpsSendError!;
    gpsSends++;
  }

  @override
  Future<List<DriverTrip>> listTrips() async {
    fetches++;
    if (tripLoadError != null) throw tripLoadError!;
    return trips;
  }
  @override
  Future<DriverTrip> start(String tripId, int revision) async {
    starts++;
    final current = trips.first;
    final updated = from(current, status: 'in_progress', revision: revision + 1);
    trips = [updated];
    return updated;
  }
  @override
  Future<DriverTrip> updateStop(String tripId, String stopId, int revision,
      {required String status, String note = '', String? requestId}) async {
    stopRequestIds.add(requestId);
    if (stopNetworkFails) throw StateError('offline');
    deliveries++;
    final current = trips.first;
    final stops = current.stops.map((stop) => DriverTripStop(
      id: stop.id, pharmacyName: stop.pharmacyName, address: stop.address,
      status: stop.id == stopId ? status : stop.status,
      note: stop.id == stopId ? note : stop.note,
    )).toList();
    final updated = DriverTrip(
      id: current.id, region: current.region, serviceDate: current.serviceDate,
      status: current.status, revision: revision + 1, stops: stops,
    );
    trips = [updated];
    return updated;
  }
  @override
  Future<DriverTrip> complete(String tripId, int revision) async {
    finishes++;
    final updated = from(trips.first, status: 'completed', revision: revision + 1);
    trips = [];
    return updated;
  }

  DriverTrip from(DriverTrip current, {required String status, required int revision}) =>
    DriverTrip(
      id: current.id, region: current.region, serviceDate: current.serviceDate,
      status: status, revision: revision, stops: current.stops,
    );
}

DriverTrip fakeTrip() => DriverTrip(
  id: 'trip-1', region: 'Kasab', serviceDate: DateTime.utc(2026, 11, 6),
  status: 'planned', revision: 0,
  stops: [
    DriverTripStop(id: 'stop-1', pharmacyName: 'Pharmacy One', address: 'Kasab Road', status: 'pending'),
  ],
);

class FakeGpsProvider implements LocationProvider {
  int reads = 0;
  @override
  Future<DeviceLocation> current() async {
    reads++;
    return DeviceLocation(
      latitude: 35.1, longitude: 35.2, accuracy: 12, isMocked: false,
      capturedAt: DateTime.now(),
    );
  }
}

class TestStopStore implements DriverStopOutboxStore {
  final Map<String, List<PendingDriverStop>> values = {};
  @override
  Future<List<PendingDriverStop>> read(String accountId) async =>
      List.of(values[accountId] ?? const []);
  @override
  Future<void> write(String accountId, List<PendingDriverStop> commands) async {
    values[accountId] = List.of(commands);
  }
}

class TestTripStore implements DriverTripSnapshotStore {
  final Map<String, DriverTripSnapshot> data = {};
  @override
  Future<DriverTripSnapshot?> read(String accountId) async => data[accountId];
  @override
  Future<void> write(String accountId, DriverTripSnapshot value) async {
    data[accountId] = value;
  }
}

class TestDriverPositionStream implements DriverPositionStream {
  final controller = StreamController<DeviceLocation>.broadcast();
  int starts = 0;
  @override
  Future<Stream<DeviceLocation>> start() async {
    starts++;
    return controller.stream;
  }
}

DeviceLocation _testFix({bool mocked = false, double accuracy = 9}) =>
  DeviceLocation(
    latitude: 35.5, longitude: 35.9, accuracy: accuracy,
    isMocked: mocked, capturedAt: DateTime.now(),
  );

void main() {
  test('trip parsing retains server revisions and stop IDs', () {
    final parsed = DriverTrip.fromJson({
      '_id': 't1', 'region': 'Kasab',
      'serviceDate': '2026-11-06T00:00:00.000Z',
      'status': 'in_progress', 'revision': 3,
      'stops': [{'_id': 'stop-1', 'pharmacyName': 'Pharmacy One', 'address': 'Road', 'status': 'pending'}],
    });
    expect(parsed.revision, 3);
    expect(parsed.region, 'Kasab');
  });

  testWidgets('assigned trip is started, stop delivered and then completed', (tester) async {
    final repository = FakeDriverRepository([fakeTrip()]);
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(repository: repository)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Kasab'), findsOneWidget);
    expect(find.text('Pharmacy One'), findsOneWidget);

    await tester.tap(find.text('Start trip'));
    await tester.pumpAndSettle();
    expect(repository.starts, 1);
    expect(find.byTooltip('Delivered'), findsOneWidget);

    await tester.tap(find.byTooltip('Delivered'));
    await tester.pumpAndSettle();
    expect(repository.deliveries, 1);
    expect(find.text('Complete trip'), findsOneWidget);

    await tester.tap(find.text('Complete trip'));
    await tester.pumpAndSettle();
    expect(repository.finishes, 1);
    expect(find.text('No assigned trips yet.'), findsOneWidget);
  });

  testWidgets('sharing is opt-in, reports an active trip and stops on demand', (tester) async {
    final trip = fakeTrip();
    final active = DriverTrip(
      id: trip.id, region: trip.region, serviceDate: trip.serviceDate,
      status: 'in_progress', revision: 1, stops: trip.stops,
    );
    final repository = FakeDriverRepository([active]);
    final gps = FakeGpsProvider();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(
        repository: repository, locationProvider: gps,
      )),
    ));
    await tester.pumpAndSettle();
    expect(repository.gpsSends, 0);
    await tester.tap(find.text('Share location during trip'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(repository.gpsSends, 1);
    expect(gps.reads, 1);
    expect(find.text('Stop sharing location'), findsOneWidget);
    await tester.tap(find.text('Stop sharing location'));
    await tester.pump();
    expect(find.text('Share location during trip'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('empty assignment has no start control', (tester) async {
    final repo = FakeDriverRepository([]);
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(repository: repo)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('No assigned trips yet.'), findsOneWidget);
    expect(find.text('Start trip'), findsNothing);
  });
  testWidgets('offline delivery stays queued and a later retry confirms it once', (tester) async {
    final seed = fakeTrip();
    final active = DriverTrip(
      id: seed.id, region: seed.region, serviceDate: seed.serviceDate,
      status: 'in_progress', revision: 4, stops: seed.stops,
    );
    final repo = FakeDriverRepository([active])..stopNetworkFails = true;
    final store = TestStopStore();
    final outbox = DriverStopOutbox(
      accountId: 'driver-123', repository: repo, store: store,
    );
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(
        repository: repo, stopOutbox: outbox,
      )),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Delivered'));
    await tester.pumpAndSettle();
    expect(store.values['driver-123'], hasLength(1));
    expect(find.textContaining('Saved stops awaiting sync: 1'), findsOneWidget);
    expect(repo.deliveries, 0);
    final stableId = store.values['driver-123']!.single.requestId;

    repo.stopNetworkFails = false;
    await tester.tap(find.text('Retry saved deliveries'));
    await tester.pumpAndSettle();
    expect(store.values['driver-123'], isEmpty);
    expect(repo.deliveries, 1);
    expect(repo.stopRequestIds, [stableId, stableId]);
    expect(find.textContaining('Saved stops awaiting sync: 1'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('offline restart displays a clearly stale, account-scoped saved trip', (tester) async {
    final seed = fakeTrip();
    final active = DriverTrip(
      id: seed.id, region: seed.region, serviceDate: seed.serviceDate,
      status: 'in_progress', revision: 7, stops: seed.stops,
    );
    final store = TestTripStore();
    final cache = DriverTripSnapshotCache(accountId: 'user-A', store: store);
    final online = FakeDriverRepository([active]);
    await tester.pumpWidget(MaterialApp(locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(repository: online, tripCache: cache))));
    await tester.pumpAndSettle();
    expect(store.data['user-A']?.trips.single.id, 'trip-1');
    await tester.pumpWidget(const SizedBox());

    final offline = FakeDriverRepository([])..tripLoadError = DioException(
      requestOptions: RequestOptions(path: '/driver/distribution/trips'),
      type: DioExceptionType.connectionError,
    );
    await tester.pumpWidget(MaterialApp(locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(repository: offline, tripCache: cache))));
    await tester.pumpAndSettle();
    expect(find.textContaining('Saved trip snapshot'), findsOneWidget);
    expect(find.text('Pharmacy One'), findsOneWidget);
    expect(find.text('Kasab'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('authorization failure never falls back to an old local trip', (tester) async {
    final store = TestTripStore();
    final cache = DriverTripSnapshotCache(accountId: 'user-A', store: store);
    await cache.save([fakeTrip()]);
    final forbidden = FakeDriverRepository([])..tripLoadError = DioException(
      requestOptions: RequestOptions(path: '/driver/distribution/trips'),
      response: Response(requestOptions: RequestOptions(path: '/driver/distribution/trips'),
        statusCode: 403),
      type: DioExceptionType.badResponse,
    );
    await tester.pumpWidget(MaterialApp(locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(repository: forbidden, tripCache: cache))));
    await tester.pumpAndSettle();
    expect(find.text('Pharmacy One'), findsNothing);
    expect(find.textContaining('Saved trip snapshot'), findsNothing);
    expect(find.textContaining('Could not load trips'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('notification-backed GPS keeps tracking after app pauses and stops on demand', (tester) async {
    final base = fakeTrip();
    final active = DriverTrip(
      id: base.id, region: base.region, serviceDate: base.serviceDate,
      status: 'in_progress', revision: 2, stops: base.stops,
    );
    final repo = FakeDriverRepository([active]);
    final positions = TestDriverPositionStream();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(
        repository: repo, positionStream: positions,
      )),
    ));
    await tester.pumpAndSettle();
    expect(positions.starts, 0);
    await tester.tap(find.text('Share location during trip'));
    await tester.pump();
    expect(positions.starts, 1);
    expect(positions.controller.hasListener, true);
    positions.controller.add(_testFix());
    await tester.pump();
    expect(repo.gpsSends, 1);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    expect(find.text('Stop sharing location'), findsOneWidget);
    expect(positions.controller.hasListener, true); // Foreground service remains subscribed.
    await tester.tap(find.text('Stop sharing location'));
    await tester.pumpAndSettle();
    expect(positions.controller.hasListener, false);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(find.text('Share location during trip'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await positions.controller.close();
  });

  testWidgets('spoofed GPS is refused even with a persistent location stream', (tester) async {
    final base = fakeTrip();
    final active = DriverTrip(
      id: base.id, region: base.region, serviceDate: base.serviceDate,
      status: 'in_progress', revision: 2, stops: base.stops,
    );
    final repo = FakeDriverRepository([active]);
    final positions = TestDriverPositionStream();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(
        repository: repo, positionStream: positions,
      )),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Share location during trip'));
    await tester.pump();
    positions.controller.add(_testFix(mocked: true));
    await tester.pump();
    expect(repo.gpsSends, 0);
    expect(find.textContaining('not shared'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(positions.controller.hasListener, false);
    await positions.controller.close();
  });

  testWidgets('ending a trip cancels location service subscription', (tester) async {
    final base = fakeTrip();
    final completedStop = DriverTripStop(id: base.stops.first.id,
      pharmacyName: base.stops.first.pharmacyName,
      address: base.stops.first.address, status: 'delivered');
    final active = DriverTrip(
      id: base.id, region: base.region, serviceDate: base.serviceDate,
      status: 'in_progress', revision: 2, stops: [completedStop],
    );
    final repo = FakeDriverRepository([active]);
    final positions = TestDriverPositionStream();
    await tester.pumpWidget(MaterialApp(locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(
        repository: repo, positionStream: positions,
      )),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Share location during trip'));
    await tester.pump();
    expect(positions.controller.hasListener, true);
    await tester.tap(find.text('Complete trip'));
    await tester.pumpAndSettle();
    expect(repo.finishes, 1);
    expect(positions.controller.hasListener, false);
    await tester.pumpWidget(const SizedBox());
    await positions.controller.close();
  });

  testWidgets('server revocation immediately stops the GPS foreground service', (tester) async {
    final base = fakeTrip();
    final active = DriverTrip(
      id: base.id, region: base.region, serviceDate: base.serviceDate,
      status: 'in_progress', revision: 2, stops: base.stops,
    );
    final repo = FakeDriverRepository([active])..gpsSendError = DioException(
      requestOptions: RequestOptions(path: '/driver/distribution/trips/trip-1/location'),
      response: Response(requestOptions: RequestOptions(path: '/driver/distribution/trips/trip-1/location'), statusCode: 403),
      type: DioExceptionType.badResponse,
    );
    final positions = TestDriverPositionStream();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: Scaffold(body: DriverTripsTab(repository: repo, positionStream: positions)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Share location during trip'));
    await tester.pump();
    positions.controller.add(_testFix());
    await tester.pumpAndSettle();
    expect(positions.controller.hasListener, false);
    expect(find.textContaining('no longer authorized'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await positions.controller.close();
  });

}
