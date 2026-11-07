import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart' as permissions;

/// Native Android permission prompts without additional pharmacy UI.
/// Rep/driver content is inaccessible while GPS or foreground permission is off.
/// Android owns the consent decision; app code cannot grant it automatically.
class AndroidStartupPermissionGate extends StatefulWidget {
  const AndroidStartupPermissionGate({
    super.key,
    required this.child,
    required this.requireGps,
    this.requestNotifications,
  });

  final Widget child;
  final bool requireGps;

  /// Injectable for widget tests; the production path invokes Android.
  final Future<void> Function()? requestNotifications;

  @override
  State<AndroidStartupPermissionGate> createState() =>
      _AndroidStartupPermissionGateState();
}

class _AndroidStartupPermissionGateState
    extends State<AndroidStartupPermissionGate> with WidgetsBindingObserver {
  bool _gpsReady = false;
  bool _checking = false;
  LocationPermission _permission = LocationPermission.unableToDetermine;
  bool _serviceEnabled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _initialRequest());
  }

  @override
  void didUpdateWidget(covariant AndroidStartupPermissionGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.requireGps && widget.requireGps) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _initialRequest() async {
    if (!mounted) return;
    // Prompt independently of Firebase initialization. Firebase might not
    // have credentials, but Android's notification permission still works.
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      try {
        if (widget.requestNotifications != null) {
          await widget.requestNotifications!();
        } else {
          await permissions.Permission.notification.request();
        }
      } catch (_) {
        // Permission denial or missing OS/plugin support must not break login.
      }
      try {
        final current = await Geolocator.checkPermission();
        if (current == LocationPermission.denied) {
          await Geolocator.requestPermission();
        }
      } catch (_) {
        // The role gate below still blocks GPS-dependent actions.
      }
    }
    await _refresh();
  }

  Future<void> _refresh() async {
    if (!mounted || _checking) return;
    _checking = true;
    try {
      final permission = await Geolocator.checkPermission();
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!mounted) return;
      setState(() {
        _permission = permission;
        _serviceEnabled = enabled;
        _gpsReady = enabled &&
            (permission == LocationPermission.whileInUse ||
             permission == LocationPermission.always);
      });
    } catch (_) {
      if (mounted) setState(() => _gpsReady = false);
    } finally {
      _checking = false;
    }
  }

  Future<void> _openGps() async {
    try {
      if (_permission == LocationPermission.denied) {
        await Geolocator.requestPermission();
      } else if (_permission == LocationPermission.deniedForever ||
                 _permission == LocationPermission.unableToDetermine) {
        await Geolocator.openAppSettings();
      } else if (!_serviceEnabled) {
        await Geolocator.openLocationSettings();
      } else {
        await Geolocator.openAppSettings();
      }
    } catch (_) {
      // System settings might be unavailable; keep the protected role closed.
    }
    await _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.requireGps || _gpsReady) return widget.child;
    final arabic = Localizations.localeOf(context).languageCode == 'ar';
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.location_off_outlined, size: 44),
            const SizedBox(height: 12),
            Text(arabic ? 'يجب تفعيل إعدادات الموقع' : 'Location must be enabled'),
            const SizedBox(height: 12),
            TextButton(
              onPressed: _openGps,
              child: Text(arabic ? 'تفعيل الموقع' : 'Enable location'),
            ),
          ],
        ),
      ),
    );
  }
}
