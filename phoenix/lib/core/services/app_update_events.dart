import 'dart:async';

/// A verified API response can supply the current public release policy even
/// when the ordinary polling interval has not elapsed yet.
class AppUpdateEvents {
  AppUpdateEvents._();
  static final _events = StreamController<Map<String, dynamic>>.broadcast();
  static Stream<Map<String, dynamic>> get stream => _events.stream;
  static void required(Map<String, dynamic> payload) => _events.add(payload);
}
