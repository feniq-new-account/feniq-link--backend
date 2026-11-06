import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';
import 'package:feniq/features/driver/data/driver_trip_repository.dart';

/// One explicitly confirmed, non-financial stop decision awaiting server ACK.
/// Never persists driver GPS, prices, invoices, payment details or credentials.
class PendingDriverStop {
  const PendingDriverStop({
    required this.tripId,
    required this.stopId,
    required this.revision,
    required this.status,
    required this.note,
    required this.requestId,
    required this.recordedAt,
  });

  final String tripId;
  final String stopId;
  final int revision;
  final String status;
  final String note;
  final String requestId;
  final DateTime recordedAt;

  Map<String, dynamic> toJson() => {
    'tripId': tripId,
    'stopId': stopId,
    'revision': revision,
    'status': status,
    'note': note,
    'requestId': requestId,
    'recordedAt': recordedAt.toUtc().toIso8601String(),
  };

  factory PendingDriverStop.fromJson(Map<String, dynamic> json) {
    final tripId = json['tripId'];
    final stopId = json['stopId'];
    final revision = json['revision'];
    final status = json['status'];
    final note = json['note'];
    final requestId = json['requestId'];
    final recordedAt = DateTime.tryParse(json['recordedAt']?.toString() ?? '');
    if (tripId is! String || tripId.isEmpty || stopId is! String || stopId.isEmpty ||
        revision is! int || revision < 0 || !['delivered', 'failed'].contains(status) ||
        note is! String || note.length > 500 ||
        requestId is! String || !RegExp(r'^[A-Za-z0-9_-]{12,96}$').hasMatch(requestId) ||
        recordedAt == null) {
      throw const FormatException('Invalid pending driver stop command');
    }
    return PendingDriverStop(
      tripId: tripId, stopId: stopId, revision: revision, status: status as String,
      note: note, requestId: requestId, recordedAt: recordedAt.toUtc(),
    );
  }
}

abstract class DriverStopOutboxStore {
  Future<List<PendingDriverStop>> read(String accountId);
  Future<void> write(String accountId, List<PendingDriverStop> commands);
}

/// Local ciphertext is namespaced by authenticated User id. This must never
/// share unsynced commands across different driver accounts on one phone.
class SecureDriverStopOutboxStore implements DriverStopOutboxStore {
  const SecureDriverStopOutboxStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  final FlutterSecureStorage _storage;
  String _key(String accountId) => 'feniq.driverStopOutbox.v1.$accountId';

  @override
  Future<List<PendingDriverStop>> read(String accountId) async {
    final encoded = await _storage.read(key: _key(accountId));
    if (encoded == null) return [];
    final value = jsonDecode(encoded);
    if (value is! List || value.length > 30) {
      throw const FormatException('Unexpected driver outbox format');
    }
    return value.map((item) => PendingDriverStop.fromJson(
      Map<String, dynamic>.from(item as Map),
    )).toList(growable: false);
  }

  @override
  Future<void> write(String accountId, List<PendingDriverStop> commands) async {
    if (commands.length > 30) throw StateError('Driver outbox is full');
    if (commands.isEmpty) {
      await _storage.delete(key: _key(accountId));
    } else {
      await _storage.write(
        key: _key(accountId),
        value: jsonEncode(commands.map((item) => item.toJson()).toList()),
      );
    }
  }
}

class DriverStopSyncResult {
  const DriverStopSyncResult({required this.confirmed, this.failure});
  final int confirmed;
  final Object? failure;
  bool get allSynced => failure == null;
}

/// Serial queue: persist before HTTP send; retry the SAME requestId and
/// original revision on uncertain network failures. A permanent conflict is
/// never rewritten into a new command or silently discarded.
class DriverStopOutbox {
  DriverStopOutbox({
    required this.accountId,
    required this.repository,
    required this.store,
    Uuid uuid = const Uuid(),
  }) : _uuid = uuid;

  final String accountId;
  final DriverTripRepository repository;
  final DriverStopOutboxStore store;
  final Uuid _uuid;
  List<PendingDriverStop> _pending = const [];
  bool _busy = false;

  List<PendingDriverStop> get pending => List.unmodifiable(_pending);

  Future<void> restore() async {
    if (accountId.isEmpty) throw StateError('Signed-in account is required');
    final loaded = await store.read(accountId);
    if (loaded.length > 30) throw StateError('Too many pending stops');
    // The original trip revision cannot safely be assumed for a second stop
    // while an earlier decision from the same trip is unacknowledged.
    if (loaded.map((item) => item.tripId).toSet().length != loaded.length) {
      throw const FormatException('Multiple unacknowledged stops for one trip');
    }
    _pending = loaded;
  }

  Future<PendingDriverStop> enqueue({
    required String tripId,
    required String stopId,
    required int revision,
    required String status,
    String note = '',
  }) async {
    if (_busy) throw StateError('Driver outbox is synchronizing');
    if (accountId.isEmpty || revision < 0 ||
        !['delivered', 'failed'].contains(status) ||
        (status == 'failed' && note.trim().isEmpty) || note.length > 500) {
      throw ArgumentError('Invalid stop decision');
    }
    if (_pending.any((item) => item.tripId == tripId)) {
      throw StateError('Synchronize the previous stop for this trip first.');
    }
    final command = PendingDriverStop(
      tripId: tripId, stopId: stopId, revision: revision, status: status,
      note: note.trim(), requestId: _uuid.v4(), recordedAt: DateTime.now().toUtc(),
    );
    final updated = [..._pending, command];
    if (updated.length > 30) throw StateError('Driver outbox is full');
    await store.write(accountId, updated); // Fail closed if persistence failed.
    _pending = updated;
    return command;
  }

  Future<DriverStopSyncResult> flush() async {
    if (_busy) return const DriverStopSyncResult(
      confirmed: 0, failure: 'Synchronization already running',
    );
    _busy = true;
    var confirmed = 0;
    try {
      while (_pending.isNotEmpty) {
        final command = _pending.first;
        try {
          final trip = await repository.updateStop(
            command.tripId, command.stopId, command.revision,
            status: command.status, note: command.note, requestId: command.requestId,
          );
          final matched = trip.stops.any((stop) =>
              stop.id == command.stopId && stop.status == command.status);
          if (!matched) throw StateError('Server did not confirm the selected stop decision.');
          final remaining = _pending.skip(1).toList();
          await store.write(accountId, remaining);
          _pending = remaining;
          confirmed += 1;
        } catch (error) {
          // Keep the original key and revision on disk. 409/403/401 require
          // user intervention; network errors may be retried on reconnect.
          return DriverStopSyncResult(confirmed: confirmed, failure: error);
        }
      }
      return DriverStopSyncResult(confirmed: confirmed);
    } finally {
      _busy = false;
    }
  }

  /// Explicit manual resolution after verifying server state; never automatic.
  Future<void> discardFirst() async {
    if (_busy) throw StateError('Cannot remove pending command during sync');
    if (_pending.isEmpty) return;
    final updated = _pending.skip(1).toList();
    await store.write(accountId, updated);
    _pending = updated;
  }
}
