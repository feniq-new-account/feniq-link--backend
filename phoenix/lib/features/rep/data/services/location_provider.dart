import 'package:geolocator/geolocator.dart';

/// Where the phone is right now, and whether the OS itself says the position
/// is spoofed (a mock-location app). The server judges the visit from these;
/// the app only reports them honestly.
class DeviceLocation {
  const DeviceLocation({
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    required this.isMocked,
  });

  final double latitude;
  final double longitude;

  /// Metres of uncertainty the phone reports around the point.
  final double accuracy;
  final bool isMocked;
}

enum LocationProblem { serviceDisabled, permissionDenied, permissionDeniedForever, unavailable }

class LocationUnavailable implements Exception {
  const LocationUnavailable(this.problem);

  final LocationProblem problem;

  @override
  String toString() => 'LocationUnavailable($problem)';
}

/// A seam over the platform location API so the scan flow can be tested
/// without a device.
abstract class LocationProvider {
  /// Throws [LocationUnavailable] when there is no usable position.
  Future<DeviceLocation> current();
}

class GeolocatorLocationProvider implements LocationProvider {
  const GeolocatorLocationProvider();

  @override
  Future<DeviceLocation> current() async {
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
    if (permission == LocationPermission.denied || permission == LocationPermission.unableToDetermine) {
      throw const LocationUnavailable(LocationProblem.permissionDenied);
    }
    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      );
      return DeviceLocation(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        isMocked: position.isMocked,
      );
    } catch (_) {
      throw const LocationUnavailable(LocationProblem.unavailable);
    }
  }
}
