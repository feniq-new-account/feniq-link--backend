import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';

/// Persists an uncertain payment before sending it. Retrying the same payload,
/// including after an app restart, reuses its key until success is confirmed.
/// Entries are private to the authenticated account, never a device-wide key.
class PendingPaymentRecord {
  const PendingPaymentRecord(this.payload, this.key);
  final Map<String, dynamic> payload;
  final String key;
}

class PendingPaymentJournal {
  static final ValueNotifier<int> changes = ValueNotifier(0);
  PendingPaymentJournal({Future<SharedPreferences> Function()? preferences})
    : _preferences = preferences ?? SharedPreferences.getInstance;

  final Future<SharedPreferences> Function() _preferences;
  final Map<String, Future<void>> _inFlight = {};
  Future<void> _serial = Future<void>.value();

  Future<void> run({
    required String ownerId,
    required Map<String, Object?> payload,
    required String proposedKey,
    required Future<void> Function(String key) send,
  }) {
    final identity = jsonEncode([ownerId, payload]);
    return _inFlight.putIfAbsent(identity, () {
      final attempt = _serial
          .then(
            (_) => _run(
              ownerId: ownerId,
              payload: payload,
              proposedKey: proposedKey,
              send: send,
            ),
          )
          .whenComplete(() {
            _inFlight.remove(identity);
          });
      _serial = attempt.then((_) {}, onError: (Object _, StackTrace __) {});
      return attempt;
    });
  }

  Future<List<PendingPaymentRecord>> read(String ownerId) async {
    final prefs = await _preferences();
    final entries =
        (jsonDecode(prefs.getString('payments.pending.$ownerId') ?? '{}')
                as Map)
            .cast<String, dynamic>();
    return [
      for (final entry in entries.entries)
        PendingPaymentRecord(
          (jsonDecode(entry.key) as Map).cast<String, dynamic>(),
          entry.value as String,
        ),
    ];
  }

  Future<void> _run({
    required String ownerId,
    required Map<String, Object?> payload,
    required String proposedKey,
    required Future<void> Function(String key) send,
  }) async {
    final prefs = await _preferences();
    final storageKey = 'payments.pending.$ownerId';
    Map<String, dynamic> entries;
    try {
      entries = (jsonDecode(prefs.getString(storageKey) ?? '{}') as Map)
          .cast<String, dynamic>();
    } catch (_) {
      // Corrupt records must never silently mint a replacement for an
      // uncertain payment. Stop and let the user reconcile the account.
      throw StateError('Pending payment record is unreadable');
    }
    final fingerprint = jsonEncode(payload);
    final key = entries[fingerprint] as String? ?? proposedKey;
    entries[fingerprint] = key;
    if (!await prefs.setString(storageKey, jsonEncode(entries))) {
      throw StateError('Could not preserve payment retry key');
    }
    changes.value++;
    await send(key);
    // Read again so independent payments cannot overwrite each other's keys.
    final latest = (jsonDecode(prefs.getString(storageKey) ?? '{}') as Map)
        .cast<String, dynamic>();
    latest.remove(fingerprint);
    await prefs.setString(storageKey, jsonEncode(latest));
    changes.value++;
  }
}
