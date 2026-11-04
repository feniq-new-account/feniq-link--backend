import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:feniq/config/app_config.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';

class AppLaunchStatus {
  const AppLaunchStatus({required this.orderingEnabled, required this.message});
  final bool orderingEnabled;
  final String message;
  factory AppLaunchStatus.fromJson(Map<String, dynamic> json) {
    final mode = json['mode'];
    if (!['registration_only', 'ordering_open'].contains(mode) ||
        json['message'] is! String ||
        json['orderingEnabled'] != (mode == 'ordering_open')) {
      throw const FormatException('Invalid launch status');
    }
    return AppLaunchStatus(
      orderingEnabled: mode == 'ordering_open',
      message: json['message'] as String,
    );
  }
}

Future<AppLaunchStatus> fetchAppLaunchStatus() async {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );
  try {
    final response = await dio.get<Map<String, dynamic>>('/app/status');
    return AppLaunchStatus.fromJson(
      Map<String, dynamic>.from(response.data!['status'] as Map),
    );
  } finally {
    dio.close();
  }
}

/// Public operational state; never a substitute for the server's checkout guard.
/// Failure or a resumed app closes checkout until a fresh response arrives.
class LaunchStatusBanner extends StatefulWidget {
  const LaunchStatusBanner({super.key, this.load, this.onOrderingChanged});
  final Future<AppLaunchStatus> Function()? load;
  final ValueChanged<bool>? onOrderingChanged;
  @override
  State<LaunchStatusBanner> createState() => _LaunchStatusBannerState();
}

class _LaunchStatusBannerState extends State<LaunchStatusBanner>
    with WidgetsBindingObserver {
  AppLaunchStatus? _status;
  bool _loading = false;
  bool _foreground = true;
  int _request = 0;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _refresh());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _refresh();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _foreground = true;
      _refresh();
    } else if (state == AppLifecycleState.paused) {
      _foreground = false;
      _request++;
      _loading = false;
      _timer?.cancel();
      widget.onOrderingChanged?.call(false);
    }
    if (state == AppLifecycleState.resumed && !(_timer?.isActive ?? false)) {
      _timer = Timer.periodic(const Duration(minutes: 1), (_) => _refresh());
    }
  }

  Future<void> _refresh() async {
    if (_loading || !mounted || !_foreground) return;
    final request = ++_request;
    setState(() {
      _loading = true;
      _status = null;
    });
    widget.onOrderingChanged?.call(false);
    AppLaunchStatus? status;
    try {
      status = await (widget.load ?? fetchAppLaunchStatus)();
    } catch (_) {
      /* No stale permission to order. */
    }
    if (!mounted || request != _request || !_foreground) return;
    setState(() {
      _status = status;
      _loading = false;
    });
    widget.onOrderingChanged?.call(status?.orderingEnabled == true);
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_status?.orderingEnabled == true) return const SizedBox.shrink();
    final l10n = context.l10n;
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.3,
      ),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _status?.message ??
                    (_loading ? l10n.launchPreparing : l10n.launchUnknown),
                textAlign: TextAlign.center,
              ),
              if (!_loading)
                TextButton(onPressed: _refresh, child: Text(l10n.launchRetry)),
            ],
          ),
        ),
      ),
    );
  }
}
