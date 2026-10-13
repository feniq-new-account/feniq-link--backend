import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lottie/lottie.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/auth/presentation/views/splash_view.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/routes/route_paths.dart';

class MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

void main() {
  late MockAuthCubit authCubit;

  setUp(() {
    authCubit = MockAuthCubit();
    when(() => authCubit.state).thenReturn(const AuthState());
    when(() => authCubit.checkSession()).thenAnswer((_) async {});
  });

  Future<void> pumpSplash(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: RoutePaths.splash,
      routes: [
        GoRoute(
          path: RoutePaths.splash,
          name: RouteNames.splash,
          builder: (context, state) => BlocProvider<AuthCubit>.value(
            value: authCubit,
            child: const SplashView(),
          ),
        ),
        GoRoute(
          path: RoutePaths.login,
          name: RouteNames.login,
          builder: (_, __) => const Scaffold(body: Text('LOGIN PAGE')),
        ),
        GoRoute(
          path: RoutePaths.warehouseSelection,
          name: RouteNames.warehouseSelection,
          builder: (_, __) => const Scaffold(body: Text('WAREHOUSES PAGE')),
        ),
        GoRoute(
          path: RoutePaths.approvalPending,
          name: RouteNames.approvalPending,
          builder: (_, __) => const Scaffold(body: Text('APPROVAL PAGE')),
        ),
        GoRoute(
          path: RoutePaths.repHome,
          name: RouteNames.repHome,
          builder: (_, __) => const Scaffold(body: Text('REP PAGE')),
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp.router(
        routerConfig: router,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
      ),
    );
    // Never pumpAndSettle here: the bird breathes on a repeating controller
    // once the intro ends, so the splash never reaches a settled frame.
    await tester.pump();
  }

  // Plays the intro out - the splash never routes away before it ends.
  Future<void> finishIntro(WidgetTester tester) async {
    await tester.pump(splashIntroDuration);
    await tester.pump();
  }

  testWidgets('shows only the animation - no connectivity error UI', (tester) async {
    await pumpSplash(tester);

    expect(find.byType(LottieBuilder), findsOneWidget);
    // The old offline gate: a wifi-off glyph over a "no connection" message
    // with a Retry button. None of it should exist any more.
    expect(find.byIcon(Icons.wifi_off_rounded), findsNothing);
    expect(find.byType(ElevatedButton), findsNothing);
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('the intro plays even when the phone has animations switched off, '
      'and shows the whole bird rather than a cropped zoom', (tester) async {
    await pumpSplash(tester);

    final lottie = tester.widget<LottieBuilder>(find.byType(LottieBuilder));
    // `normal` would finish the intro in milliseconds on such a phone, leaving
    // the bird frozen on its last frame.
    expect(lottie.controller, isA<AnimationController>());
    expect(
      (lottie.controller! as AnimationController).animationBehavior,
      AnimationBehavior.preserve,
    );
    // `cover` cropped the wings and beak off a tall screen's sides.
    expect(lottie.fit, BoxFit.contain);
  });

  testWidgets('an unreachable server on launch does not strand the user - it '
      'carries on into the app', (tester) async {
    whenListen(
      authCubit,
      Stream.value(const AuthState(sessionStatus: SessionStatus.offline)),
      initialState: const AuthState(),
    );

    await pumpSplash(tester);
    await finishIntro(tester);

    expect(find.text('WAREHOUSES PAGE'), findsOneWidget);
    expect(find.byIcon(Icons.wifi_off_rounded), findsNothing);
  });

  testWidgets('a session answered early still waits for the intro to end', (tester) async {
    when(() => authCubit.state)
        .thenReturn(const AuthState(sessionStatus: SessionStatus.unauthenticated));
    whenListen(
      authCubit,
      Stream.value(const AuthState(sessionStatus: SessionStatus.unauthenticated)),
      initialState: const AuthState(),
    );

    await pumpSplash(tester);
    await tester.pump(splashIntroDuration - const Duration(milliseconds: 100));
    expect(find.text('LOGIN PAGE'), findsNothing);

    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump();
    expect(find.text('LOGIN PAGE'), findsOneWidget);
  });

  const repUser = UserModel(
    id: 'rep1',
    name: 'أحمد',
    phone: '+963940000201',
    role: 'rep',
    status: 'active',
    lang: 'ar',
  );

  // The splash reacts to the status CHANGING, then asks the cubit who the
  // account is - so the state is switched only when the status is emitted.
  Future<void> emitAfterSplash(WidgetTester tester, AuthState next) async {
    final controller = StreamController<AuthState>();
    addTearDown(controller.close);
    whenListen(authCubit, controller.stream, initialState: const AuthState());
    await pumpSplash(tester);
    when(() => authCubit.state).thenReturn(next);
    controller.add(next);
    await tester.pump();
    await finishIntro(tester);
  }

  testWidgets('a rep goes to the rep screens, not the warehouse list', (tester) async {
    await emitAfterSplash(tester, const AuthState(sessionStatus: SessionStatus.active, user: repUser));

    expect(find.text('REP PAGE'), findsOneWidget);
    expect(find.text('WAREHOUSES PAGE'), findsNothing);
  });

  testWidgets('a rep starting without a connection still reaches the rep screens '
      '(the role comes from the stored token)', (tester) async {
    await emitAfterSplash(tester, const AuthState(sessionStatus: SessionStatus.offline, tokenRole: 'rep'));

    expect(find.text('REP PAGE'), findsOneWidget);
  });

  testWidgets('a pharmacy on the same path still goes to the warehouse list', (tester) async {
    await emitAfterSplash(
      tester,
      const AuthState(
        sessionStatus: SessionStatus.active,
        user: UserModel(id: 'p1', name: 'Dr', phone: '+963931000001', role: 'pharmacy', status: 'active', lang: 'ar'),
      ),
    );

    expect(find.text('WAREHOUSES PAGE'), findsOneWidget);
    expect(find.text('REP PAGE'), findsNothing);
  });

  double scaleValue(WidgetTester tester) => tester
      .widget<ScaleTransition>(find.byKey(splashLogoScaleKey))
      .scale
      .value;

  double opacityValue(WidgetTester tester) => tester
      .widget<FadeTransition>(find.byKey(splashLogoFadeKey))
      .opacity
      .value;

  testWidgets('the bird holds still during the intro', (tester) async {
    await pumpSplash(tester);
    await tester.pump(const Duration(milliseconds: 700));

    expect(scaleValue(tester), 1.0);
    expect(opacityValue(tester), 1.0);
  });

  testWidgets('after the intro the bird breathes on a repeating animation', (tester) async {
    await pumpSplash(tester);
    await finishIntro(tester);

    final firstScale = scaleValue(tester);
    final firstOpacity = opacityValue(tester);

    // Part-way into the 900ms half-cycle, the logo has grown a little and
    // dimmed a little.
    await tester.pump(const Duration(milliseconds: 450));

    expect(scaleValue(tester), greaterThan(firstScale));
    expect(opacityValue(tester), lessThan(firstOpacity));

    // Two full half-cycles later it is back where it started and still
    // driving frames - it repeats rather than running once and stopping.
    await tester.pump(const Duration(milliseconds: 1350));
    expect(scaleValue(tester), closeTo(firstScale, 0.001));
    expect(opacityValue(tester), closeTo(firstOpacity, 0.001));
    expect(tester.binding.hasScheduledFrame, isTrue);
  });

  testWidgets('the pulse stays subtle', (tester) async {
    await pumpSplash(tester);
    await finishIntro(tester);

    // At the far end of its travel: a 4% grow and a 15% fade, nothing louder.
    await tester.pump(const Duration(milliseconds: 900));

    expect(scaleValue(tester), closeTo(1.04, 0.001));
    expect(opacityValue(tester), closeTo(0.85, 0.001));
  });
}
