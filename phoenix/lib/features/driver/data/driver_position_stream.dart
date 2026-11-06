import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geolocator_android/geolocator_android.dart'
    show AndroidSettings, ForegroundNotificationConfig;
import 'package:feniq/features/rep/data/services/location_provider.dart';

/// A driver explicitly starts location sharing from the visible trip screen.
/// The Android implementation keeps a foreground-service notification while
/// the subscription is active; no hidden startup or GPS history is retained.
abstract class DriverPositionStream {
  Future<Stream<DeviceLocation>> start();
}

class GeolocatorDriverPositionStream implements DriverPositionStream {
  const GeolocatorDriverPositionStream();

  @override
  Future<Stream<DeviceLocation>> start() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationUnavailable(LocationProblem.serviceDisabled);
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) {
      throw const LocationUnavailable(LocationProblem.permissionDeniedForever);
    }
    if (permission != LocationPermission.whileInUse &&
        permission != LocationPermission.always) {
      throw const LocationUnavailable(LocationProblem.permissionDenied);
    }

    // Android 14 requires a location FGS to be started while the app is
    // visible and to display an ongoing notification. Never automatically
    // restart it on boot or from an inactive/background lifecycle callback.
    final LocationSettings settings = defaultTargetPlatform == TargetPlatform.android
        ? AndroidSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 0,
            intervalDuration: const Duration(seconds: 30),
            foregroundNotificationConfig: const ForegroundNotificationConfig(
              notificationTitle: 'Feniq — Delivery location',
              notificationText:
                  'Trip location sharing is active. Open Feniq to stop sharing.',
              notificationChannelName: 'Feniq active deliveries',
              enableWakeLock: true,
              setOngoing: true,
            ),
          )
        : const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 0);

    return Geolocator.getPositionStream(locationSettings: settings).map((position) =>
      DeviceLocation(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        isMocked: position.isMocked,
        capturedAt: position.timestamp,
      ),
    );
  }
}
