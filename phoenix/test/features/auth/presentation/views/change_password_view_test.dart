import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/auth/presentation/views/change_password_view.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/app_router.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/routes/route_paths.dart';

class MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

const _forcedState = AuthState(
  sessionStatus: SessionStatus.passwordChangeRequired,
  user: UserModel(
    id: 'u1',
    name: 'Dr. Test',
    phone: '+963999999999',
    role: 'pharmacy',
    status: 'active',
    lang: 'ar',
    mustChangePassword: true,
  ),
);

void main() {
  late MockAuthCubit auth;

  setUp(() {
    auth = MockAuthCubit();
  });

  void stubChange(bool result, {AuthState? after}) {
    when(
      () => auth.changePassword(
        currentPassword: any(named: 'currentPassword'),
        newPassword: any(named: 'newPassword'),
      ),
    ).thenAnswer((_) async {
      if (after != null) when(() => auth.state).thenReturn(after);
      return result;
    });
  }

  // The app's own redirect is installed, and the cubit is provided ABOVE the
  // router exactly as main.dart does it, so the redirect really reads it.
  Future<GoRouter> pump(
    WidgetTester tester, {
    required String initialLocation,
    Locale? locale,
  }) async {
    final router = GoRouter(
      initialLocation: initialLocation,
      redirect: forcePasswordChangeRedirect,
      routes: [
        GoRoute(
          path: RoutePaths.warehouseSelection,
          name: RouteNames.warehouseSelection,
          builder: (_, __) => const Scaffold(body: Text('HOME PAGE')),
        ),
        GoRoute(
          path: RoutePaths.profile,
          name: RouteNames.profile,
          builder: (context, __) => Scaffold(
            body: TextButton(
              onPressed: () => context.pushNamed(RouteNames.changePassword),
              child: const Text('OPEN CHANGE PASSWORD'),
            ),
          ),
        ),
        GoRoute(
          path: RoutePaths.login,
          name: RouteNames.login,
          builder: (_, __) => const Scaffold(body: Text('LOGIN PAGE')),
        ),
        GoRoute(
          path: RoutePaths.changePassword,
          name: RouteNames.changePassword,
          builder: (_, __) => const ChangePasswordView(),
        ),
      ],
    );

    await tester.pumpWidget(
      BlocProvider<AuthCubit>.value(
        value: auth,
        child: MaterialApp.router(
          routerConfig: router,
          locale: locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  Future<void> fill(WidgetTester tester, {required String current, required String next, String? confirm}) async {
    await tester.enterText(
      find.descendant(of: find.byKey(changePasswordCurrentFieldKey), matching: find.byType(TextField)),
      current,
    );
    await tester.enterText(
      find.descendant(of: find.byKey(changePasswordNewFieldKey), matching: find.byType(TextField)),
      next,
    );
    await tester.enterText(
      find.descendant(of: find.byKey(changePasswordConfirmFieldKey), matching: find.byType(TextField)),
      confirm ?? next,
    );
  }

  Future<void> submit(WidgetTester tester) async {
    await tester.ensureVisible(find.byKey(changePasswordSubmitKey));
    await tester.tap(find.byKey(changePasswordSubmitKey));
    await tester.pumpAndSettle();
  }

  group('forced after an admin reset', () {
    setUp(() => when(() => auth.state).thenReturn(_forcedState));

    testWidgets('every other route is redirected to the change screen', (tester) async {
      final router = await pump(tester, initialLocation: RoutePaths.warehouseSelection);

      expect(find.byType(ChangePasswordView), findsOneWidget);
      expect(find.text('HOME PAGE'), findsNothing);

      // A later navigation (a tab, a notification deep link) is caught too.
      router.go(RoutePaths.profile);
      await tester.pumpAndSettle();
      expect(find.byType(ChangePasswordView), findsOneWidget);
      expect(find.text('OPEN CHANGE PASSWORD'), findsNothing);
    });

    testWidgets('explains why, has no Back, and cannot be popped', (tester) async {
      await pump(tester, initialLocation: RoutePaths.changePassword);

      expect(find.byKey(changePasswordForcedBannerKey), findsOneWidget);
      expect(find.text('Temporary password'), findsOneWidget);
      expect(find.byType(BackButton), findsNothing);
      expect(find.byKey(changePasswordLogoutKey), findsOneWidget);

      final navigator = tester.state<NavigatorState>(find.byType(Navigator).last);
      await navigator.maybePop();
      await tester.pumpAndSettle();
      expect(find.byType(ChangePasswordView), findsOneWidget);
    });

    testWidgets('a successful change goes into the app', (tester) async {
      stubChange(true, after: const AuthState(sessionStatus: SessionStatus.active));
      await pump(tester, initialLocation: RoutePaths.changePassword);

      await fill(tester, current: 'TempPass7xKq', next: 'my-own-password-9');
      await submit(tester);

      verify(
        () => auth.changePassword(currentPassword: 'TempPass7xKq', newPassword: 'my-own-password-9'),
      ).called(1);
      expect(find.text('HOME PAGE'), findsOneWidget);
    });

    testWidgets('a wrong temporary password is shown in Arabic and stays put', (tester) async {
      stubChange(
        false,
        after: _forcedState.copyWith(
          errorCode: 'INVALID_CURRENT_PASSWORD',
          errorMessage: 'The current password is incorrect.',
        ),
      );
      await pump(tester, initialLocation: RoutePaths.changePassword, locale: const Locale('ar'));

      expect(find.text('كلمة السر المؤقتة'), findsOneWidget);
      await fill(tester, current: 'wrong-one', next: 'my-own-password-9');
      await submit(tester);

      expect(find.text('كلمة المرور غير صحيحة.'), findsOneWidget);
      expect(find.byType(ChangePasswordView), findsOneWidget);
    });

    testWidgets('signing out is still possible', (tester) async {
      when(() => auth.logout()).thenAnswer((_) async {
        when(() => auth.state).thenReturn(const AuthState(sessionStatus: SessionStatus.unauthenticated));
      });
      await pump(tester, initialLocation: RoutePaths.changePassword);

      await tester.tap(find.byKey(changePasswordLogoutKey));
      await tester.pumpAndSettle();

      verify(() => auth.logout()).called(1);
      expect(find.text('LOGIN PAGE'), findsOneWidget);
    });
  });

  group('from Settings', () {
    setUp(() => when(() => auth.state).thenReturn(const AuthState(sessionStatus: SessionStatus.active)));

    testWidgets('no redirect for an active session; Back works', (tester) async {
      await pump(tester, initialLocation: RoutePaths.profile);
      expect(find.text('OPEN CHANGE PASSWORD'), findsOneWidget);

      await tester.tap(find.text('OPEN CHANGE PASSWORD'));
      await tester.pumpAndSettle();
      expect(find.byType(ChangePasswordView), findsOneWidget);
      expect(find.byKey(changePasswordForcedBannerKey), findsNothing);
      expect(find.text('Current password'), findsOneWidget);
      expect(find.byType(BackButton), findsOneWidget);

      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      expect(find.text('OPEN CHANGE PASSWORD'), findsOneWidget);
    });

    testWidgets('form checks run before anything is sent', (tester) async {
      stubChange(true);
      await pump(tester, initialLocation: RoutePaths.changePassword);

      await fill(tester, current: 'old-pass-1', next: 'short');
      await submit(tester);
      expect(find.text('Password must be at least 8 characters.'), findsOneWidget);

      await fill(tester, current: 'old-pass-1', next: 'new-pass-22', confirm: 'new-pass-23');
      await submit(tester);
      expect(find.text('Passwords do not match.'), findsWidgets);

      await fill(tester, current: 'same-pass-1', next: 'same-pass-1');
      await submit(tester);
      expect(find.text('The new password must be different from the current one.'), findsOneWidget);

      verifyNever(
        () => auth.changePassword(
          currentPassword: any(named: 'currentPassword'),
          newPassword: any(named: 'newPassword'),
        ),
      );
    });

    testWidgets('a successful change returns to Settings', (tester) async {
      stubChange(true);
      await pump(tester, initialLocation: RoutePaths.profile);
      await tester.tap(find.text('OPEN CHANGE PASSWORD'));
      await tester.pumpAndSettle();

      await fill(tester, current: 'old-pass-1', next: 'new-pass-22');
      await submit(tester);

      expect(find.byType(ChangePasswordView), findsNothing);
      expect(find.text('OPEN CHANGE PASSWORD'), findsOneWidget);
      expect(find.text('Password changed. Other devices have been signed out.'), findsOneWidget);
    });
  });
}
