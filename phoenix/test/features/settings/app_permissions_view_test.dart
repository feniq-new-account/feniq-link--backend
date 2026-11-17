import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/permissions/app_permissions.dart';
import 'package:feniq/features/auth/data/models/user_model.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/features/settings/presentation/views/app_permissions_view.dart';
import 'package:feniq/features/settings/presentation/widgets/push_reliability_banner.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/route_names.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _FakePermissions extends AppPermissionsService {
  _FakePermissions({this.maker = 'Xiaomi', Map<AppPermissionKind, AppPermissionState>? states})
      : states = states ?? {};

  final String maker;
  final Map<AppPermissionKind, AppPermissionState> states;
  final List<AppPermissionKind> requested = [];
  int autostartOpened = 0;
  bool delayed = false;

  @override
  Future<String> manufacturer() async => maker;

  @override
  Future<AppPermissionState> status(AppPermissionKind kind) async =>
      states[kind] ?? (kind == AppPermissionKind.autostart ? AppPermissionState.unknown : AppPermissionState.denied);

  @override
  Future<AppPermissionState> request(AppPermissionKind kind) async {
    requested.add(kind);
    return states[kind] = AppPermissionState.granted;
  }

  @override
  Future<bool> openAutostartSettings() async {
    autostartOpened++;
    return true;
  }

  @override
  Future<bool> pushMayBeDelayed() async => delayed;
}

AuthCubit _authFor(String role, {String warehouseRole = 'owner'}) {
  final auth = _Auth();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: AuthState(
      sessionStatus: SessionStatus.active,
      user: UserModel(id: 'u', name: 'U', phone: '+963944000001', role: role, status: 'active', lang: 'ar',
          warehouseRole: warehouseRole),
    ),
  );
  return auth;
}

Widget _app(Widget child, AuthCubit auth) => BlocProvider<AuthCubit>.value(
      value: auth,
      child: MaterialApp(
        locale: const Locale('ar'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: child,
      ),
    );

void main() {
  testWidgets('a manager on a Xiaomi sees notifications, battery and autostart with their state', (tester) async {
    final fake = _FakePermissions(states: {AppPermissionKind.notifications: AppPermissionState.granted});
    await tester.pumpWidget(_app(AppPermissionsView(service: fake), _authFor('warehouse')));
    await tester.pumpAndSettle();

    expect(find.text('صلاحيات التطبيق'), findsOneWidget);
    expect(find.text('الإشعارات'), findsOneWidget);
    expect(find.text('بلا قيود على البطارية'), findsOneWidget);
    expect(find.text('التشغيل التلقائي'), findsOneWidget);
    expect(find.text('مفعّلة'), findsOneWidget);
    expect(find.textContaining('صوت واهتزاز مع كل طلبية'), findsOneWidget);

    // Battery: one tap shows Android's prompt and the row turns green.
    final battery = find.byKey(const ValueKey('perm-battery'));
    await tester.tap(find.descendant(of: battery, matching: find.text('فعّل')));
    await tester.pumpAndSettle();
    expect(fake.requested, [AppPermissionKind.battery]);
    expect(find.descendant(of: battery, matching: find.text('مفعّلة')), findsOneWidget);

    // Autostart cannot be read: it opens the maker's page.
    final autostart = find.byKey(const ValueKey('perm-autostart'));
    await tester.scrollUntilVisible(autostart, 200);
    await tester.tap(find.descendant(of: autostart, matching: find.text('افتح الصفحة')));
    await tester.pumpAndSettle();
    expect(fake.autostartOpened, 1);
  });

  testWidgets('a refused permission sends the user to settings instead of a dead prompt', (tester) async {
    final fake = _FakePermissions(maker: 'samsung', states: {
      AppPermissionKind.notifications: AppPermissionState.blocked,
    });
    await tester.pumpWidget(_app(AppPermissionsView(service: fake), _authFor('pharmacy')));
    await tester.pumpAndSettle();
    final row = find.byKey(const ValueKey('perm-notifications'));
    expect(find.descendant(of: row, matching: find.text('افتح الإعدادات')), findsOneWidget);
    expect(find.text('بلا قيود على البطارية'), findsNothing);
  });

  testWidgets('the orders-tab banner shows only while pushes may be held back, and opens the screen',
      (tester) async {
    final fake = _FakePermissions()..delayed = true;
    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: PushReliabilityBanner(service: fake))),
      GoRoute(path: '/p', name: RouteNames.appPermissions, builder: (_, __) => const Text('permissions-screen')),
    ]);
    await tester.pumpWidget(BlocProvider<AuthCubit>.value(
      value: _authFor('warehouse'),
      child: MaterialApp.router(
        locale: const Locale('ar'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('ممكن تتأخر إشعارات الطلبيات على هالموبايل.'), findsOneWidget);
    await tester.tap(find.text('صلّحها'));
    await tester.pumpAndSettle();
    expect(find.text('permissions-screen'), findsOneWidget);
  });

  testWidgets('the banner stays hidden when everything is on', (tester) async {
    final fake = _FakePermissions();
    await tester.pumpWidget(_app(Scaffold(body: PushReliabilityBanner(service: fake)), _authFor('warehouse')));
    await tester.pumpAndSettle();
    expect(find.text('صلّحها'), findsNothing);
  });
}
