import 'package:flutter/foundation.dart';

/// Whether what the pharmacist is looking at right now came from the phone's
/// own saved copy instead of the server.
///
/// Set by the repositories when they fall back to the saved copy, cleared by
/// the next call that reaches the server. A single app-wide instance: the
/// banner above the screens (OfflineBanner) listens to it, and nothing else
/// needs to know - the screens and cubits show saved data exactly like live
/// data.
class OfflineStatus {
  OfflineStatus._();

  static final OfflineStatus instance = OfflineStatus._();

  /// When the saved copy being shown was taken; null while everything is live.
  final ValueNotifier<DateTime?> cachedSince = ValueNotifier<DateTime?>(null);

  void servedFromSavedCopy(DateTime savedAt) {
    cachedSince.value = savedAt;
  }

  void live() {
    cachedSince.value = null;
  }
}
