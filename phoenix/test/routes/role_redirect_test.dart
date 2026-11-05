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
const _driver = UserModel(id: 'd1', name: 'Driver', phone: '+963940000211', role: 'driver', status: 'active', lang: 'ar');
const _pharmacist = UserModel(id: 'p1', name: 'د. سلمى', phone: '+963931000001', role: 'pharmacy', status: 'active', lang: 'ar');
const _warehouse = UserModel(id: 'w1', name: 'مستودع النجاح', phone: '+963930000101', role: 'warehouse', status: 'active', lang: 'ar');

void main() {
  group('homeRouteNameFor', () {
    test('a rep lands on the rep screens, everyone else on the warehouse list', () {
      expect(homeRouteNameFor(const AuthState(user: _rep)), RouteNames.repHome);
      expect(homeRouteNameFor(const AuthState(user: _pharmacist)), RouteNames.warehouseSelection);
      expect(homeRouteNameFor(const AuthState()), RouteNames.warehouseSelection);
      expect(homeRouteNameFor(const AuthState(tokenRole: 'rep')), RouteNames.repHome);
      expect(homeRouteNameFor(const AuthState(user: _driver)), RouteNames.driverHome);
      expect(homeRouteNameFor(const AuthState(tokenRole: 'driver')), RouteNames.driverHome);
    });

    test('a warehouse lands on its orders, an admin on the panel landing', () {
      expect(homeRouteNameFor(const AuthState(user: _warehouse)), RouteNames.warehouseHome);
      expect(homeRouteNameFor(const AuthState(tokenRole: 'warehouse')), RouteNames.warehouseHome);
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
          GoRoute(path: RoutePaths.driverHome, builder: (_, __) => page('DRIVER HOME')), 
          GoRoute(path: RoutePaths.repScan, builder: (_, __) => page('REP SCAN')),
          GoRoute(path: RoutePaths.repPharmacy, builder: (_, __) => page('REP PHARMACY')),
          GoRoute(path: RoutePaths.panelHome, builder: (_, __) => page('PANEL HOME')),
          GoRoute(path: RoutePaths.warehouseHome, builder: (_, __) => page('WAREHOUSE HOME')),
          GoRoute(path: RoutePaths.warehouseOrder, builder: (_, s) => page('WAREHOUSE ORDER ${s.pathParameters['orderId']}')),
          GoRoute(path: RoutePaths.orderTracking, builder: (_, __) => page('TRACKING')),
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
    const activeDriver = AuthState(sessionStatus: SessionStatus.active, user: _driver);
    const activePharmacist = AuthState(sessionStatus: SessionStatus.active, user: _pharmacist);
    const activeWarehouse = AuthState(sessionStatus: SessionStatus.active, user: _warehouse);
    const activeAdmin = AuthState(
      sessionStatus: SessionStatus.active,
      user: UserModel(id: 'a1', name: 'Admin', phone: '+963930000001', role: 'admin', status: 'active', lang: 'ar'),
    );

    testWidgets('transport driver cannot access rep, warehouse, or pharmacy screens', (tester) async {
      await pump(tester, activeDriver, RoutePaths.repHome);
      expect(find.text('DRIVER HOME'), findsOneWidget);
      await pump(tester, activeDriver, RoutePaths.warehouseHome);
      expect(find.text('DRIVER HOME'), findsOneWidget);
      await pump(tester, activeDriver, RoutePaths.cart);
      expect(find.text('DRIVER HOME'), findsOneWidget);
      await pump(tester, activeDriver, RoutePaths.panelHome);
      expect(find.text('DRIVER HOME'), findsOneWidget);
    });

    testWidgets('driver stays inside its dedicated dashboard', (tester) async {
      await pump(tester, activeDriver, RoutePaths.driverHome);
      expect(find.text('DRIVER HOME'), findsOneWidget);
    });

    testWidgets('a rep or pharmacy cannot enter the standalone driver screen', (tester) async {
      await pump(tester, activeRep, RoutePaths.driverHome);
      expect(find.text('REP HOME'), findsOneWidget);
      await pump(tester, activePharmacist, RoutePaths.driverHome);
      expect(find.text('WAREHOUSES'), findsOneWidget);
    });

    testWidgets('offline driver stays isolated using its verified token role', (tester) async {
      await pump(tester, const AuthState(
        sessionStatus: SessionStatus.offline, tokenRole: 'driver',
      ), RoutePaths.cart);
      expect(find.text('DRIVER HOME'), findsOneWidget);
    });

    testWidgets('driver changing password cannot reach trips until changed', (tester) async {
      await pump(tester, const AuthState(
        sessionStatus: SessionStatus.passwordChangeRequired, user: _driver,
      ), RoutePaths.driverHome);
      expect(find.text('CHANGE PASSWORD'), findsOneWidget);
    });

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

    testWidgets('a warehouse account asking for a pharmacy or rep screen is sent to its orders', (tester) async {
      await pump(tester, activeWarehouse, RoutePaths.cart);
      expect(find.text('WAREHOUSE HOME'), findsOneWidget);
      await pump(tester, activeWarehouse, RoutePaths.repHome);
      expect(find.text('WAREHOUSE HOME'), findsOneWidget);
      await pump(tester, activeWarehouse, RoutePaths.panelHome);
      expect(find.text('WAREHOUSE HOME'), findsOneWidget);
    });

    testWidgets('a warehouse stays on its own screens, the notifications and the auth steps', (tester) async {
      await pump(tester, activeWarehouse, '/warehouse/orders/o1');
      expect(find.text('WAREHOUSE ORDER o1'), findsOneWidget);
      await pump(tester, activeWarehouse, RoutePaths.notifications);
      expect(find.text('NOTIFICATIONS'), findsOneWidget);
      await pump(tester, activeWarehouse, RoutePaths.privacyPolicy);
      expect(find.text('PRIVACY'), findsOneWidget);
    });

    testWidgets('an order notification tapped by a warehouse opens its own view of that order', (tester) async {
      await pump(tester, activeWarehouse, '/orders/o42');
      expect(find.text('WAREHOUSE ORDER o42'), findsOneWidget);
    });

    testWidgets('an admin is kept on the panel landing', (tester) async {
      await pump(tester, activeAdmin, RoutePaths.cart);
      expect(find.text('PANEL HOME'), findsOneWidget);
      await pump(tester, activeAdmin, RoutePaths.warehouseHome);
      expect(find.text('PANEL HOME'), findsOneWidget);
    });

    testWidgets('a pharmacy asking for a warehouse screen is sent to the warehouse list', (tester) async {
      await pump(tester, activePharmacist, RoutePaths.warehouseHome);
      expect(find.text('WAREHOUSES'), findsOneWidget);
    });

    testWidgets('a pharmacy asking for the panel landing is sent to the warehouse list', (tester) async {
      await pump(tester, activePharmacist, RoutePaths.panelHome);
      expect(find.text('WAREHOUSES'), findsOneWidget);
    });
  });
}
