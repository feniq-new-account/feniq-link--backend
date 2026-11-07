import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/scaffold_with_bottom_nav.dart';

// The Returns tab was renamed to "Account History" (and localized), and an
// Offers & Ads tab was added second. This exercises the real
// ScaffoldWithBottomNav against a minimal shell router so the labels and the
// tab order are pinned without pulling in the whole app.
GoRouter _shellRouter() => GoRouter(
  initialLocation: '/warehouses',
  routes: [
    // A standalone page pushed above the pharmacy tab shell must still pop
    // to its previous page, not get intercepted by the tab-root Back rule.
    GoRoute(
      path: '/order-detail',
      builder: (_, __) => const Scaffold(body: Text('DETAIL')),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) =>
          ScaffoldWithBottomNav(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/warehouses', builder: (_, __) => const Scaffold(body: Text('W')))],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/offers-and-ads', builder: (_, __) => const Scaffold(body: Text('F')))],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/my-orders', builder: (_, __) => const Scaffold(body: Text('O')))],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/account-history', builder: (_, __) => const Scaffold(body: Text('A')))],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/profile', builder: (_, __) => const Scaffold(body: Text('P')))],
        ),
      ],
    ),
  ],
);

Future<void> _pump(WidgetTester tester, {Locale? locale}) async {
  await tester.pumpWidget(
    MaterialApp.router(
      routerConfig: _shellRouter(),
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Test 1: the third tab reads "Accounts", not "Returns"', (tester) async {
    await _pump(tester);

    final bar = find.byType(NavigationBar);
    expect(bar, findsOneWidget);
    expect(find.descendant(of: bar, matching: find.text('Accounts')), findsOneWidget);
    expect(find.descendant(of: bar, matching: find.text('Returns')), findsNothing);
  });

  testWidgets('Test 10: the tab label is localized to Arabic', (tester) async {
    await _pump(tester, locale: const Locale('ar'));

    expect(
      find.descendant(of: find.byType(NavigationBar), matching: find.text('الحسابات')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: find.byType(NavigationBar), matching: find.text('المرتجعات')),
      findsNothing,
    );
  });

  testWidgets('tapping the Accounts tab activates its branch', (tester) async {
    await _pump(tester);

    await tester.tap(find.text('Accounts'));
    await tester.pumpAndSettle();

    expect(find.text('A'), findsOneWidget);
  });

  testWidgets('the second tab is Offers, between Warehouses and Orders', (tester) async {
    await _pump(tester);

    final bar = find.byType(NavigationBar);
    final labels = tester
        .widgetList<NavigationDestination>(
          find.descendant(of: bar, matching: find.byType(NavigationDestination)),
        )
        .map((destination) => destination.label)
        .toList();

    expect(labels, ['Warehouses', 'Offers', 'Orders', 'Accounts', 'Profile']);
  });

  testWidgets('the Offers tab label is localized to Arabic', (tester) async {
    await _pump(tester, locale: const Locale('ar'));

    expect(
      find.descendant(of: find.byType(NavigationBar), matching: find.text('العروض')),
      findsOneWidget,
    );
  });

  testWidgets('tapping the Offers tab activates its branch', (tester) async {
    await _pump(tester);

    await tester.tap(find.text('Offers'));
    await tester.pumpAndSettle();

    expect(find.text('F'), findsOneWidget);
  });

  testWidgets('Android Back from Orders returns home instead of exiting', (tester) async {
    await _pump(tester);
    await tester.tap(find.text('Orders'));
    await tester.pumpAndSettle();
    expect(find.text('O'), findsOneWidget);

    // Simulate the phone's system Back button, not an AppBar arrow.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('W'), findsOneWidget);
    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 0);
    // The next Back is no longer intercepted: the system may exit the app.
    final pop = tester.widget<PopScope<Object?>>(find.byType(PopScope<Object?>));
    expect(pop.canPop, isTrue);
  });

  for (final (label, body) in [
    ('Offers', 'F'),
    ('Accounts', 'A'),
    ('Profile', 'P'),
  ]) {
    testWidgets('system Back from $label returns to home', (tester) async {
      await _pump(tester);
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
      expect(find.text(body), findsOneWidget);

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();

      expect(find.text('W'), findsOneWidget);
      expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 0);
    });
  }

  testWidgets('Back from a full-screen detail page pops only the detail', (tester) async {
    await _pump(tester);
    await tester.tap(find.text('Orders'));
    await tester.pumpAndSettle();
    final router = GoRouter.of(tester.element(find.text('O')));
    router.push('/order-detail');
    await tester.pumpAndSettle();
    expect(find.text('DETAIL'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('O'), findsOneWidget);
    expect(find.text('DETAIL'), findsNothing);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('W'), findsOneWidget);
  });

  // Five labels in one bar is the reason the Offers tab uses the short
  // `navOffers` rather than the screen's own "Offers & Ads" title. Arabic is
  // the tighter of the two languages, so it is what this checks.
  testWidgets('all five tabs fit a 390pt phone in Arabic', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await _pump(tester, locale: const Locale('ar'));

    expect(find.byType(NavigationDestination), findsNWidgets(5));
    expect(tester.takeException(), isNull);
  });
}
