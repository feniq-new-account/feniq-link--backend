import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:lottie/lottie.dart';
import 'package:feniq/core/widgets/brand_logo.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/routes/home_route.dart';
import 'package:feniq/routes/route_names.dart';

// The two halves of the bird's breathing once the intro has played, keyed so a
// test can find them among the router's own page transitions.
const Key splashLogoFadeKey = ValueKey('splashLogoFade');
const Key splashLogoScaleKey = ValueKey('splashLogoScale');

/// How long the intro animation (assets/animations/phoenix_splash.json, 90
/// frames at 60fps) runs. The splash never routes away before it ends, so the
/// bird is always seen whole; a session check that takes longer keeps the bird
/// breathing until it answers.
const Duration splashIntroDuration = Duration(milliseconds: 1500);

class SplashView extends StatefulWidget {
  const SplashView({super.key});

  @override
  State<SplashView> createState() => _SplashViewState();
}

class _SplashViewState extends State<SplashView> {
  late final Timer _introTimer;
  bool _introDone = false;

  @override
  void initState() {
    super.initState();
    _introTimer = Timer(splashIntroDuration, () {
      if (!mounted) return;
      setState(() => _introDone = true);
      // The check may have answered while the intro was still playing.
      _routeFor(context, context.read<AuthCubit>().state.sessionStatus);
    });
    // TEMP DIAGNOSTIC (router-lifecycle) - remove after verifying.
    debugPrint('ROUTER_DEBUG: SplashView.initState()');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // TEMP DIAGNOSTIC (router-lifecycle) - remove after verifying.
      debugPrint(
        'ROUTER_DEBUG: SplashView post-frame -> AuthCubit.checkSession() '
        '(sessionStatus now = ${context.read<AuthCubit>().state.sessionStatus})',
      );
      context.read<AuthCubit>().checkSession();
    });
  }

  @override
  void dispose() {
    _introTimer.cancel();
    super.dispose();
  }

  void _routeFor(BuildContext context, SessionStatus status) {
    // Let the intro finish first - the timer above routes when it ends.
    if (!_introDone) return;
    // TEMP DIAGNOSTIC (router-lifecycle) - remove after verifying.
    debugPrint('ROUTER_DEBUG: SplashView listener -> navigating for $status');
    switch (status) {
      case SessionStatus.unauthenticated:
        context.goNamed(RouteNames.login);
      case SessionStatus.pendingApproval:
        context.goNamed(RouteNames.approvalPending);
      case SessionStatus.blocked:
        context.goNamed(RouteNames.approvalPending);
      case SessionStatus.passwordChangeRequired:
        context.goNamed(RouteNames.changePassword);
      case SessionStatus.active:
        context.goNamed(homeRouteNameFor(context.read<AuthCubit>().state));
      case SessionStatus.offline:
        // The stored token is still present and untouched - the server just
        // could not be reached to re-validate it on this launch. That is not
        // a reason to hold the user on a dead-end "no connection" screen:
        // carry on into the app exactly as for `active`. The warehouse list
        // (and every other screen that needs the network) already shows its
        // own error state with a retry, which is where a genuine outage
        // belongs.
        context.goNamed(homeRouteNameFor(context.read<AuthCubit>().state));
      case SessionStatus.unknown:
        // The check is still running - stay on the logo.
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthCubit, AuthState>(
      listenWhen: (previous, current) {
        // TEMP DIAGNOSTIC (router-lifecycle) - remove after verifying.
        debugPrint(
          'ROUTER_DEBUG: SplashView listenWhen prev=${previous.sessionStatus} '
          'curr=${current.sessionStatus} '
          'notify=${previous.sessionStatus != current.sessionStatus}',
        );
        return previous.sessionStatus != current.sessionStatus;
      },
      listener: (context, state) => _routeFor(context, state.sessionStatus),
      child: _SplashLogo(breathing: _introDone),
    );
  }
}

class _SplashLogo extends StatefulWidget {
  const _SplashLogo({required this.breathing});

  /// False while the intro plays; then the bird breathes until we route away.
  final bool breathing;

  @override
  State<_SplashLogo> createState() => _SplashLogoState();
}

class _SplashLogoState extends State<_SplashLogo>
    with SingleTickerProviderStateMixin {
  // The animation's own ground: a radial glow from its centre (690px radius
  // on its 1080x1920 canvas) out to near-black navy - the same outer colour as
  // the Android launch window (splash_navy), so start-up shows no seam. It is
  // painted here rather than in the animation so the breathing below moves
  // only the bird and its rings, never the whole screen.
  static const Color _glow = Color(0xFF0C2152);
  static const Color _ground = Color(0xFF030814);
  static const Size _canvas = Size(1080, 1920);
  static const double _glowRadius = 690;

  // One breath in, one out - ~1.8s per full cycle. Calm enough to read as
  // "alive, still working", never as an animation asking to be looked at.
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  late final Animation<double> _curve = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeInOut,
  );

  late final Animation<double> _scale = Tween<double>(
    begin: 1.0,
    end: 1.04,
  ).animate(_curve);

  late final Animation<double> _opacity = Tween<double>(
    begin: 1.0,
    end: 0.85,
  ).animate(_curve);

  @override
  void initState() {
    super.initState();
    if (widget.breathing) _controller.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(_SplashLogo oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.breathing && !_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _ground,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final size = constraints.biggest;
          // BoxFit.cover scale, so the painted glow lines up with the
          // animation drawn over it on any screen shape.
          final cover = math.max(
            size.width / _canvas.width,
            size.height / _canvas.height,
          );
          return DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                radius: _glowRadius * cover / size.shortestSide,
                colors: const [_glow, _ground],
              ),
            ),
            child: FadeTransition(
              // Keyed so a test can pick this fade out of the page-transition
              // fades the router stacks around it.
              key: splashLogoFadeKey,
              opacity: _opacity,
              child: ScaleTransition(
                key: splashLogoScaleKey,
                scale: _scale,
                child: SizedBox.expand(
                  child: Lottie.asset(
                    'assets/animations/phoenix_splash.json',
                    repeat: false,
                    fit: BoxFit.cover,
                    // A broken or missing animation still leaves the logo.
                    errorBuilder: (_, __, ___) => const Center(
                      child: BrandLogo.onDark(width: 200),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
