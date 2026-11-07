import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

/// Ask Android directly, without a custom explanation screen.
/// The OS owns the decision; a refusal never blocks pharmacy orders.
Future<void> requestPharmacyStartupPermissions() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
  try {
    final status = await Geolocator.checkPermission();
    if (status == LocationPermission.denied) {
      await Geolocator.requestPermission();
    }
  } catch (error) {
    debugPrint('Location permission request unavailable: $error');
  }
  try {
    if (await Permission.notification.isDenied) {
      await Permission.notification.request();
    }
  } catch (error) {
    debugPrint('Notification permission request unavailable: $error');
  }
}

/// Notification consent must not depend on Firebase configuration.
Future<void> requestAndroidNotificationPermission() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
  try {
    if (await Permission.notification.isDenied) {
      await Permission.notification.request();
    }
  } catch (error) {
    debugPrint('Notification permission request unavailable: $error');
  }
}
