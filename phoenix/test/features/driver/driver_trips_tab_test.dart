import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';
import 'package:feniq/features/driver/presentation/driver_trips_tab.dart';

class FakeDriverRepository implements DriverTripRepository {
  FakeDriverRepository(this.trips);
  List<DriverTrip> trips;
  int fetches = 0;
  int starts = 0;
  int deliveries = 0;
  int finishes = 0;

  @override
  Future<List<DriverTrip>> listTrips() async {
    fetches++;
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
      {required String status, String note = ''}) async {
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
}
