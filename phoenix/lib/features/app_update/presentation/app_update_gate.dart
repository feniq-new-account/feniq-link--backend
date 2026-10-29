import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/services/app_update_events.dart';
import 'package:feniq/core/services/app_update_service.dart';
import 'package:feniq/core/services/navigation_service.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'app_update_dialog.dart';

/// Inside MaterialApp.builder, above the router. A mandatory policy blocks
/// all app content, including saved catalogs, and leaves the updater usable.
class AppUpdateGate extends StatefulWidget {
  const AppUpdateGate({
    super.key,
    required this.service,
    required this.isAppShellReady,
    required this.child,
  });
  final AppUpdateService service;
  final bool Function() isAppShellReady;
  final Widget child;
  @override
  State<AppUpdateGate> createState() => _AppUpdateGateState();
}

class _AppUpdateGateState extends State<AppUpdateGate>
    with WidgetsBindingObserver {
  AppUpdateStatus _status = AppUpdateStatus.none;
  String? _role;
  bool _checking = false;
  bool _queued = false;
  bool _optionalShowing = false;
  final Set<String> _optionalShown = {};
  Timer? _timer;
  StreamSubscription<AuthState>? _auth;
  StreamSubscription<Map<String, dynamic>>? _required;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final auth = context.read<AuthCubit?>();
    _role = auth?.state.role;
    _auth = auth?.stream.listen((state) {
      if (_role == state.role) return;
      _role = state.role;
      unawaited(_run());
    });
    _required = AppUpdateEvents.stream.listen((payload) async {
      try {
        await widget.service.acceptRequiredPolicy(payload);
        if (mounted) await _run();
      } catch (_) {
        if (mounted) await _run();
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _run());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_run());
  }

  @override
  Future<bool> didPopRoute() async => _status == AppUpdateStatus.mandatory;

  Future<void> _run() async {
    if (!mounted) return;
    if (_checking) {
      _queued = true;
      return;
    }
    _checking = true;
    final role = _role;
    try {
      final status = await widget.service.checkForUpdate(role: role);
      if (!mounted) return;
      if (role != _role) {
        _queued = true;
        return;
      }
      setState(() => _status = status);
      final optionalKey =
          '${role ?? 'anonymous'}:${widget.service.release?.latestBuild ?? 'legacy'}';
      if (status == AppUpdateStatus.optional &&
          !_optionalShowing &&
          !_optionalShown.contains(optionalKey)) {
        for (var i = 0; i < 40 && mounted && !widget.isAppShellReady(); i++) {
          await Future<void>.delayed(const Duration(milliseconds: 250));
        }
        if (!mounted || _status != AppUpdateStatus.optional || role != _role) {
          return;
        }
        final navigatorContext =
            NavigationService.instance.navigatorKey.currentContext;
        if (navigatorContext != null && navigatorContext.mounted) {
          _optionalShown.add(optionalKey);
          _optionalShowing = true;
          unawaited(
            showAppUpdateDialog(
              navigatorContext,
              mandatory: false,
              service: widget.service,
            ).whenComplete(() => _optionalShowing = false),
          );
        }
      }
    } finally {
      _checking = false;
      if (_queued && mounted) {
        _queued = false;
        unawaited(_run());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final blocking = _status == AppUpdateStatus.mandatory;
    return Stack(
      fit: StackFit.expand,
      children: [
        ExcludeSemantics(
          excluding: blocking,
          child: Offstage(offstage: blocking, child: widget.child),
        ),
        if (blocking) ...[
          const ModalBarrier(dismissible: false, color: Colors.black54),
          SafeArea(
            child: Center(
              child: AppUpdateDialog(mandatory: true, service: widget.service),
            ),
          ),
        ],
      ],
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    unawaited(_auth?.cancel());
    unawaited(_required?.cancel());
    super.dispose();
  }
}
