import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

/// Everything the app may ask the phone for, in one list, so the
/// "App permissions" screen can show each one with why it is needed and
/// whether it is on.
enum AppPermissionKind {
  /// Push banners: new orders for a warehouse, order updates for a pharmacy.
  notifications,

  /// "Don't optimise" for Feniq. Without it Xiaomi/Huawei/Samsung battery
  /// savers delay or drop pushes while the phone sleeps in a pocket.
  battery,

  /// Xiaomi/Oppo/Vivo/Huawei "Autostart": a separate switch those phones keep
  /// off by default. It cannot be read by an app, only opened for the user.
  autostart,

  /// Location while the app is open: pharmacy map pin, rep visits, driver.
  location,

  /// Location in the background: only a driver on an active trip.
  backgroundLocation,

  /// Camera: return photos, delivery seal, visit QR scan.
  camera,

  /// Microphone: recording a payment by voice.
  microphone,
}

/// Where a permission stands right now.
enum AppPermissionState {
  granted,

  /// Not on yet; asking will show Android's own prompt.
  denied,

  /// Refused for good ("don't ask again"): only system settings can change it.
  blocked,

  /// The phone cannot tell us (autostart) - the user checks it by hand.
  unknown,
}

/// The signed-in account, reduced to what decides which permissions matter.
@immutable
class PermissionAudience {
  const PermissionAudience({required this.role, this.warehouseRole = 'legacy'});

  final String role;
  final String warehouseRole;

  bool get isAccountant => role == 'warehouse' && warehouseRole == 'accountant';
}

/// Manufacturers whose phones ship with an "Autostart" switch off by default.
const Set<String> kAutostartManufacturers = {
  'xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'vivo', 'iqoo', 'huawei', 'honor', 'oneplus', 'tecno', 'infinix', 'itel',
};

/// The permissions this account needs, most important first. Pure, so the
/// rule is tested on its own. [manufacturer] decides whether the autostart
/// row is shown at all.
List<AppPermissionKind> permissionsFor(PermissionAudience audience, {String manufacturer = ''}) {
  final autostart = kAutostartManufacturers.contains(manufacturer.trim().toLowerCase());
  final kinds = switch (audience.role) {
    // The manager and the accountant must both hear every new order, so the
    // push-reliability trio comes first. The accountant records payments
    // (voice included) but takes no photos.
    'warehouse' => [
        AppPermissionKind.notifications,
        AppPermissionKind.battery,
        AppPermissionKind.autostart,
        if (!audience.isAccountant) AppPermissionKind.camera,
        AppPermissionKind.microphone,
      ],
    'driver' => [
        AppPermissionKind.notifications,
        AppPermissionKind.location,
        AppPermissionKind.backgroundLocation,
        AppPermissionKind.battery,
        AppPermissionKind.autostart,
      ],
    'rep' => [
        AppPermissionKind.notifications,
        AppPermissionKind.location,
        AppPermissionKind.camera,
      ],
    _ => [
        AppPermissionKind.notifications,
        AppPermissionKind.location,
        AppPermissionKind.camera,
      ],
  };
  return [for (final kind in kinds) if (kind != AppPermissionKind.autostart || autostart) kind];
}

/// Reads and asks for permissions. Every call swallows platform errors (no
/// plugin in a test, an OS without the setting) and answers "unknown"/false.
class AppPermissionsService {
  AppPermissionsService({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('com.feniq.link/device_settings');

  /// Shared instance; tests swap it for a fake.
  static AppPermissionsService instance = AppPermissionsService();

  final MethodChannel _channel;
  String? _manufacturer;

  bool get _isAndroid => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<String> manufacturer() async {
    if (_manufacturer != null) return _manufacturer!;
    if (!_isAndroid) return _manufacturer = '';
    try {
      _manufacturer = (await _channel.invokeMethod<String>('manufacturer')) ?? '';
    } catch (_) {
      _manufacturer = '';
    }
    return _manufacturer!;
  }

  Permission? _permission(AppPermissionKind kind) => switch (kind) {
        AppPermissionKind.notifications => Permission.notification,
        AppPermissionKind.battery => Permission.ignoreBatteryOptimizations,
        AppPermissionKind.location => Permission.locationWhenInUse,
        AppPermissionKind.backgroundLocation => Permission.locationAlways,
        AppPermissionKind.camera => Permission.camera,
        AppPermissionKind.microphone => Permission.microphone,
        AppPermissionKind.autostart => null,
      };

  Future<AppPermissionState> status(AppPermissionKind kind) async {
    final permission = _permission(kind);
    if (permission == null) return AppPermissionState.unknown;
    try {
      return _map(await permission.status);
    } catch (_) {
      return AppPermissionState.unknown;
    }
  }

  /// Shows Android's prompt, or opens the right settings page when the prompt
  /// can no longer appear. Returns the state afterwards.
  Future<AppPermissionState> request(AppPermissionKind kind) async {
    if (kind == AppPermissionKind.autostart) {
      await openAutostartSettings();
      return AppPermissionState.unknown;
    }
    final permission = _permission(kind)!;
    try {
      final current = _map(await permission.status);
      if (current == AppPermissionState.blocked) {
        await openAppSettings();
        return _map(await permission.status);
      }
      // Android only grants background location after the foreground one.
      if (kind == AppPermissionKind.backgroundLocation &&
          !(await Permission.locationWhenInUse.status).isGranted) {
        await Permission.locationWhenInUse.request();
      }
      return _map(await permission.request());
    } catch (_) {
      return AppPermissionState.unknown;
    }
  }

  /// Opens the phone maker's autostart page, or the app's own settings page
  /// when this phone has none. True when some page opened.
  Future<bool> openAutostartSettings() async {
    if (!_isAndroid) return false;
    try {
      return (await _channel.invokeMethod<bool>('openAutostartSettings')) ?? false;
    } catch (_) {
      return false;
    }
  }

  /// True when a pushed order could be held back on this phone: banners off,
  /// or the battery saver still allowed to put Feniq to sleep.
  Future<bool> pushMayBeDelayed() async {
    if (!_isAndroid) return false;
    final notifications = await status(AppPermissionKind.notifications);
    final battery = await status(AppPermissionKind.battery);
    return notifications == AppPermissionState.denied ||
        notifications == AppPermissionState.blocked ||
        battery == AppPermissionState.denied ||
        battery == AppPermissionState.blocked;
  }

  AppPermissionState _map(PermissionStatus status) {
    if (status.isGranted || status.isLimited || status.isProvisional) return AppPermissionState.granted;
    if (status.isPermanentlyDenied || status.isRestricted) return AppPermissionState.blocked;
    return AppPermissionState.denied;
  }
}
