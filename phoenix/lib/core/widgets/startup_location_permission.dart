import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';

/// Requests foreground access when a pharmacy/rep first enters the app.
/// Refusal leaves browsing available; a visit still requires a fresh fix.
class StartupLocationPermission extends StatefulWidget {
  const StartupLocationPermission({super.key});
  @override
  State<StartupLocationPermission> createState() => _StartupLocationPermissionState();
}

class _StartupLocationPermissionState extends State<StartupLocationPermission> with WidgetsBindingObserver {
  String _status = 'checking';
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check(request: true));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _check();
  }

  Future<void> _check({bool request = false}) async {
    if (_busy || !mounted) return;
    _busy = true;
    var status = 'unavailable';
    try {
      var permission = await Geolocator.checkPermission();
      if (!mounted) return;
      if (permission == LocationPermission.denied && request) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.deniedForever) {
        status = 'permanent';
      } else if (permission == LocationPermission.denied || permission == LocationPermission.unableToDetermine) {
        status = 'denied';
      } else {
        status = await Geolocator.isLocationServiceEnabled() ? 'granted' : 'disabled';
      }
    } catch (_) {
      status = 'unavailable';
    } finally {
      _busy = false;
      if (mounted) setState(() => _status = status);
    }
  }

  Future<void> _resolve() async {
    try {
      if (_status == 'permanent') {
        await Geolocator.openAppSettings();
      } else if (_status == 'disabled') {
        await Geolocator.openLocationSettings();
      } else {
        await _check(request: true);
      }
    } catch (_) {
      if (mounted) setState(() => _status = 'unavailable');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_status == 'granted') return const SizedBox.shrink();
    final l10n = context.l10n;
    final message = switch (_status) {
      'permanent' => l10n.locationPermissionPermanent,
      'disabled' => l10n.locationServiceDisabled,
      _ => l10n.locationPermissionPurpose,
    };
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.3),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(padding: EdgeInsets.only(top: 4), child: Icon(Icons.location_on_outlined, size: 20)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(message, style: Theme.of(context).textTheme.bodySmall),
                    if (_status != 'checking')
                      TextButton(
                        onPressed: _resolve,
                        child: Text(
                          _status == 'permanent' || _status == 'disabled'
                              ? l10n.locationOpenSettings
                              : l10n.locationAllow,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
