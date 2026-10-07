import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/app_router.dart';
import 'package:feniq/routes/home_route.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/routes/route_paths.dart';

class MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

const _rep = UserModel(id: 'r1', name: 'أحمد', phone: '+963940000201', role: 'rep', status: 'active', lang: 'ar');
const _pharmacist = UserModel(id: 'p1', name: 'د. سلمى', phone: '+963931000001', role: 'pharmacy', status: 'active', lang: 'ar');
const _warehouse = UserModel(id: 'w1', name: 'مستودع النجاح', phone: '+963930000101', role: 'warehouse', status: 'active', lang: 'ar');

void main() {
  group('homeRouteNameFor', () {
    test('a rep lands on the rep screens, everyone else on the warehouse list', () {
      expect(homeRouteNameFor(const AuthState(user: _rep)), RouteNames.repHome);
      expect(homeRouteNameFor(const AuthState(user: _pharmacist)), RouteNames.warehouseSelection);
      expect(homeRouteNameFor(const AuthState()), RouteNames.warehouseSelection);
      expect(homeRouteNameFor(const AuthState(tokenRole: 'rep')), RouteNames.repHome);
    });

    test('a warehouse or admin account lands on the panel landing', () {
      expect(homeRouteNameFor(const AuthState(user: _warehouse)), RouteNames.panelHome);
      expect(homeRouteNameFor(const AuthState(tokenRole: 'admin')), RouteNames.panelHome);
    });
  });

  group('appRedirect keeps each role on its own side', () {
    late MockAuthCubit auth;

    setUp(() => auth = MockAuthCubit());

    Future<void> pump(WidgetTester tester, AuthState state, String initialLocation) async {
      when(() => auth.state).thenReturn(state);
      Widget page(String label) => Scaffold(body: Text(label));
      final router = GoRouter(
        initialLocation: initialLocation,
        redirect: appRedirect,
        routes: [
          GoRoute(path: RoutePaths.splash, builder: (_, __) => page('SPLASH')),
          GoRoute(path: RoutePaths.login, builder: (_, __) => page('LOGIN')),
          GoRoute(path: RoutePaths.changePassword, builder: (_, __) => page('CHANGE PASSWORD')),
          GoRoute(path: RoutePaths.approvalPending, builder: (_, __) => page('APPROVAL')),
          GoRoute(path: RoutePaths.privacyPolicy, builder: (_, __) => page('PRIVACY')),
          GoRoute(path: RoutePaths.warehouseSelection, builder: (_, __) => page('WAREHOUSES')),
          GoRoute(path: RoutePaths.cart, builder: (_, __) => page('CART')),
          GoRoute(path: RoutePaths.notifications, builder: (_, __) => page('NOTIFICATIONS')),
          GoRoute(path: RoutePaths.repHome, builder: (_, __) => page('REP HOME')),
          GoRoute(path: RoutePaths.repScan, builder: (_, __) => page('REP SCAN')),
          GoRoute(path: RoutePaths.repPharmacy, builder: (_, __) => page('REP PHARMACY')),
          GoRoute(path: RoutePaths.panelHome, builder: (_, __) => page('PANEL HOME')),
        ],
      );
      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: auth,
          child: MaterialApp.router(
            routerConfig: router,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    const activeRep = AuthState(sessionStatus: SessionStatus.active, user: _rep);
    const activePharmacist = AuthState(sessionStatus: SessionStatus.active, user: _pharmacist);
    const activeWarehouse = AuthState(sessionStatus: SessionStatus.active, user: _warehouse);

    testWidgets('a rep asking for a pharmacy screen (a stale link) is sent to the rep home', (tester) async {
      await pump(tester, activeRep, RoutePaths.cart);
      expect(find.text('REP HOME'), findsOneWidget);
    });

    testWidgets('a rep\'s own screens, nested ones included, are left alone', (tester) async {
      await pump(tester, activeRep, RoutePaths.repScan);
      expect(find.text('REP SCAN'), findsOneWidget);
    });

    testWidgets('a rep may open a pharmacy page that is theirs', (tester) async {
      await pump(tester, activeRep, '/rep/pharmacies/p1');
      expect(find.text('REP PHARMACY'), findsOneWidget);
    });

    testWidgets('the auth steps and the privacy policy stay reachable for a rep', (tester) async {
      await pump(tester, activeRep, RoutePaths.privacyPolicy);
      expect(find.text('PRIVACY'), findsOneWidget);
    });

    testWidgets('a pharmacy asking for a rep screen is sent to the warehouse list', (tester) async {
      await pump(tester, activePharmacist, RoutePaths.repHome);
      expect(find.text('WAREHOUSES'), findsOneWidget);
    });

    testWidgets('a pharmacy is untouched on its own screens', (tester) async {
      await pump(tester, activePharmacist, RoutePaths.cart);
      expect(find.text('CART'), findsOneWidget);
    });

    testWidgets('offline, the role in the token still keeps a rep inside /rep', (tester) async {
      await pump(tester, const AuthState(sessionStatus: SessionStatus.offline, tokenRole: 'rep'), RoutePaths.notifications);
      expect(find.text('REP HOME'), findsOneWidget);
    });

    testWidgets('while the session is still being checked nothing is redirected', (tester) async {
      await pump(tester, const AuthState(tokenRole: 'rep'), RoutePaths.cart);
      expect(find.text('CART'), findsOneWidget);
    });

    testWidgets('a rep who must change the temporary password goes there first', (tester) async {
      await pump(tester, const AuthState(sessionStatus: SessionStatus.passwordChangeRequired, user: _rep), RoutePaths.repHome);
      expect(find.text('CHANGE PASSWORD'), findsOneWidget);
    });

    testWidgets('a warehouse account asking for a pharmacy or rep screen is sent to the panel landing', (tester) async {
      await pump(tester, activeWarehouse, RoutePaths.cart);
      expect(find.text('PANEL HOME'), findsOneWidget);
      await pump(tester, activeWarehouse, RoutePaths.repHome);
      expect(find.text('PANEL HOME'), findsOneWidget);
    });

    testWidgets('a warehouse account stays on the panel landing and the auth steps', (tester) async {
      await pump(tester, activeWarehouse, RoutePaths.panelHome);
      expect(find.text('PANEL HOME'), findsOneWidget);
      await pump(tester, activeWarehouse, RoutePaths.privacyPolicy);
      expect(find.text('PRIVACY'), findsOneWidget);
    });

    testWidgets('a pharmacy asking for the panel landing is sent to the warehouse list', (tester) async {
      await pump(tester, activePharmacist, RoutePaths.panelHome);
      expect(find.text('WAREHOUSES'), findsOneWidget);
    });
  });
}
