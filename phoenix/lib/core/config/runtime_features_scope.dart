import 'dart:async';
import 'package:flutter/widgets.dart';

/// The server remains authoritative for writes. Refresh on start, resume and
/// every 30 seconds so an installed app can follow the admin switch.
class RuntimeFeaturesScope extends StatefulWidget {
  const RuntimeFeaturesScope({super.key, required this.load, required this.child});
  final Future<bool> Function() load;
  final Widget child;

  static bool ratingsEnabled(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<_RatingsSetting>()?.enabled ?? true;

  @override
  State<RuntimeFeaturesScope> createState() => _RuntimeFeaturesScopeState();
}

class _RuntimeFeaturesScopeState extends State<RuntimeFeaturesScope>
    with WidgetsBindingObserver {
  bool _enabled = false;
  int _request = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _refresh());
  }

  Future<void> _refresh() async {
    final request = ++_request;
    bool enabled;
    try { enabled = await widget.load(); } catch (_) { enabled = false; }
    if (mounted && request == _request) setState(() => _enabled = enabled);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _RatingsSetting(enabled: _enabled, child: widget.child);
}

class _RatingsSetting extends InheritedWidget {
  const _RatingsSetting({required this.enabled, required super.child});
  final bool enabled;
  @override
  bool updateShouldNotify(_RatingsSetting oldWidget) => enabled != oldWidget.enabled;
}

/// Reload masked review data when an already-open screen is re-enabled.
class RatingsRefresh extends StatefulWidget {
  const RatingsRefresh({super.key, required this.onEnabled, required this.child});
  final VoidCallback onEnabled;
  final Widget child;
  @override
  State<RatingsRefresh> createState() => _RatingsRefreshState();
}

class _RatingsRefreshState extends State<RatingsRefresh> {
  bool? _wasEnabled;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final enabled = RuntimeFeaturesScope.ratingsEnabled(context);
    if (_wasEnabled == false && enabled) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _wasEnabled == true) widget.onEnabled();
      });
    }
    _wasEnabled = enabled;
  }
  @override
  Widget build(BuildContext context) => widget.child;
}
