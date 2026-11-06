import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';

/// A time-labelled, private operational snapshot, never financial data or GPS.
/// Offline data is informational until the server acknowledges a mutation.
class DriverTripSnapshot {
  const DriverTripSnapshot({required this.trips, required this.savedAt});
  final List<DriverTrip> trips;
  final DateTime savedAt;
}

abstract class DriverTripSnapshotStore {
  Future<DriverTripSnapshot?> read(String accountId);
  Future<void> write(String accountId, DriverTripSnapshot value);
}

class SecureDriverTripSnapshotStore implements DriverTripSnapshotStore {
  const SecureDriverTripSnapshotStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  final FlutterSecureStorage _storage;

  String _key(String accountId) => 'feniq.driverTrips.v1.$accountId';

  @override
  Future<DriverTripSnapshot?> read(String accountId) async {
    final raw = await _storage.read(key: _key(accountId));
    if (raw == null) return null;
    final value = jsonDecode(raw);
    if (value is! Map<String, dynamic>) {
      throw const FormatException('Invalid driver trip cache');
    }
    final timestamp = DateTime.tryParse(value['savedAt']?.toString() ?? '');
    final items = value['trips'];
    if (timestamp == null || items is! List || items.length > 40) {
      throw const FormatException('Invalid driver trip cache payload');
    }
    final now = DateTime.now().toUtc();
    if (timestamp.isAfter(now.add(const Duration(minutes: 5))) ||
        now.difference(timestamp.toUtc()) > const Duration(days: 7)) {
      return null; // Stale snapshots cannot be used indefinitely.
    }
    final trips = items.map((item) {
      final data = Map<String, dynamic>.from(item as Map);
      final stops = data['stops'];
      if (stops is! List || stops.length > 50 ||
          !['planned', 'in_progress'].contains(data['status'])) {
        throw const FormatException('Invalid cached driver trip');
      }
      return DriverTrip.fromJson(data);
    }).toList(growable: false);
    return DriverTripSnapshot(trips: trips, savedAt: timestamp.toUtc());
  }

  @override
  Future<void> write(String accountId, DriverTripSnapshot value) async {
    if (value.trips.length > 40 || value.trips.any((trip) =>
        trip.stops.length > 50 || !['planned', 'in_progress'].contains(trip.status))) {
      throw StateError('Invalid driver snapshot');
    }
    final records = value.trips.map((trip) => {
      '_id': trip.id,
      'region': trip.region,
      'serviceDate': trip.serviceDate.toUtc().toIso8601String(),
      'status': trip.status,
      'revision': trip.revision,
      'stops': trip.stops.map((stop) => {
        '_id': stop.id, 'pharmacyName': stop.pharmacyName,
        'address': stop.address, 'status': stop.status, 'note': stop.note,
      }).toList(),
    }).toList();
    await _storage.write(key: _key(accountId), value: jsonEncode({
      'savedAt': value.savedAt.toUtc().toIso8601String(),
      'trips': records,
    }));
  }
}

/// Namespaces the encrypted cache by the currently signed-in account.
/// All authorization and assignment checks still happen on the live API.
class DriverTripSnapshotCache {
  const DriverTripSnapshotCache({
    required this.accountId,
    required this.store,
  });

  final String accountId;
  final DriverTripSnapshotStore store;

  Future<void> save(List<DriverTrip> trips) {
    if (accountId.isEmpty) throw StateError('Missing current driver identity');
    return store.write(accountId, DriverTripSnapshot(
      trips: trips, savedAt: DateTime.now().toUtc(),
    ));
  }

  Future<DriverTripSnapshot?> read() {
    if (accountId.isEmpty) throw StateError('Missing current driver identity');
    return store.read(accountId);
  }
}
