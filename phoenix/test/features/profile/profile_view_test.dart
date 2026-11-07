import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/theme/dark_theme.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/debts/presentation/widgets/debts_overview.dart';
import 'package:feniq/features/profile/presentation/views/profile_view.dart';
import 'package:feniq/features/settings/presentation/managers/settings_cubit.dart';
import 'package:feniq/features/settings/presentation/managers/settings_state.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/route_names.dart';

class MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class MockSettingsCubit extends MockCubit<SettingsState> implements SettingsCubit {}

void main() {
  late MockAuthCubit auth;
  late MockSettingsCubit settings;

  setUp(() {
    auth = MockAuthCubit();
    settings = MockSettingsCubit();
    when(() => auth.state).thenReturn(const AuthState(sessionStatus: SessionStatus.active));
    when(() => settings.state).thenReturn(const SettingsState());
  });

  Future<void> pump(WidgetTester tester, {Locale? locale, ThemeData? theme}) async {
    final router = GoRouter(
      initialLocation: '/profile',
      routes: [
        GoRoute(
          path: '/profile',
          name: RouteNames.profile,
          builder: (context, state) => MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: auth),
              BlocProvider<SettingsCubit>.value(value: settings),
            ],
            child: const ProfileView(),
          ),
        ),
        GoRoute(
          path: '/my-ratings',
          name: RouteNames.pharmacyReviews,
          builder: (_, __) => const Scaffold(body: Text('RATINGS PAGE')),
        ),
        GoRoute(
          path: '/complaints',
          name: RouteNames.complaints,
          builder: (_, __) => const Scaffold(body: Text('COMPLAINTS PAGE')),
        ),
        GoRoute(
          path: '/change-password',
          name: RouteNames.changePassword,
          builder: (_, __) => const Scaffold(body: Text('CHANGE PASSWORD PAGE')),
        ),
        GoRoute(
          path: '/privacy-policy',
          name: RouteNames.privacyPolicy,
          builder: (_, __) => const Scaffold(body: Text('PRIVACY PAGE')),
        ),
      ],
    );

    await tester.pumpWidget(
      MaterialApp.router(
        routerConfig: router,
        locale: locale,
        theme: theme,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('Test 1: the Debts section is gone from Profile', (tester) async {
    await pump(tester);

    expect(find.byType(DebtsOverview), findsNothing);
    expect(find.text('My Debts'), findsNothing);
    expect(find.text('Total debts'), findsNothing);
  });

  testWidgets('Test 3: Profile hides mutual ratings entry at launch', (tester) async {
    await pump(tester);

    expect(find.text('Ratings'), findsNothing);
    expect(find.text('View Ratings'), findsNothing);
  });

  testWidgets('Test 4: the full ratings/reviews list is NOT rendered inside Profile', (tester) async {
    await pump(tester);

    // The inline summary card ("x average (n ratings)") and filled review
    // stars are gone - only the outline icon on the nav card remains.
    expect(find.textContaining('average'), findsNothing);
    expect(find.byIcon(Icons.star), findsNothing);
  });

  testWidgets('Test 6: Arabic localization', (tester) async {
    await pump(tester, locale: const Locale('ar'));

    expect(find.text('التقييمات'), findsNothing);
    expect(find.text('عرض التقييمات'), findsNothing);
  });

  testWidgets('Test 7: renders in dark mode without error', (tester) async {
    await pump(tester, theme: DarkTheme.data);

    expect(tester.takeException(), isNull);
    expect(find.byType(ProfileView), findsOneWidget);
    expect(find.text('View Ratings'), findsNothing);
  });

  testWidgets('Test 8: Settings has a Change password entry that opens the screen', (tester) async {
    await pump(tester);

    await tester.scrollUntilVisible(
      find.byKey(profileChangePasswordKey),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Change password'), findsOneWidget);
    await tester.tap(find.byKey(profileChangePasswordKey));
    await tester.pumpAndSettle();

    expect(find.text('CHANGE PASSWORD PAGE'), findsOneWidget);
  });

  testWidgets('Test 9: the Change password entry is translated', (tester) async {
    await pump(tester, locale: const Locale('ar'));

    await tester.scrollUntilVisible(
      find.byKey(profileChangePasswordKey),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('تغيير كلمة السر'), findsOneWidget);
  });

  testWidgets('language selection follows the resolved locale without an override', (tester) async {
    await pump(tester, locale: const Locale('en'));
    await tester.scrollUntilVisible(find.text('English'), 200,
      scrollable: find.byType(Scrollable).first);
    final container = tester.widget<Container>(find.ancestor(
      of: find.text('English'), matching: find.byType(Container)).first);
    expect((container.decoration! as BoxDecoration).color, isNot(Colors.transparent));
  });

  testWidgets('international phone remains left to right in an Arabic profile', (tester) async {
    const phone = '+963944000201';
    when(() => auth.state).thenReturn(const AuthState(
      sessionStatus: SessionStatus.active,
      user: UserModel(id: 'qa', name: 'Demo', phone: phone, role: 'pharmacy', status: 'active', lang: 'ar'),
    ));
    await pump(tester, locale: const Locale('ar'));
    expect(tester.widget<Text>(find.text(phone)).textDirection, TextDirection.ltr);
  });
}
