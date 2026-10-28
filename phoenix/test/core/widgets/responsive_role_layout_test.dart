import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/theme/light_theme.dart';
import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:feniq/generated/app_localizations.dart';

void main() {
  testWidgets('large Arabic labels use an accessible section picker and every tab remains reachable', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 640);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(() {
      tester.view.resetDevicePixelRatio();
      tester.view.resetPhysicalSize();
      tester.platformDispatcher.clearTextScaleFactorTestValue();
    });
    var selected = 0;
    const labels = ['الطلبات', 'المرتجعات', 'الحسابات', 'المندوبين', 'الحساب'];
    await tester.pumpWidget(
      MaterialApp(
        theme: LightTheme.data,
        locale: const Locale('ar'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: StatefulBuilder(
          builder: (context, setState) => ResponsiveRoleScaffold(
            appBar: AppBar(title: const Text('فينيق')),
            body: const SizedBox.expand(),
            selectedIndex: selected,
            onSelected: (index) => setState(() => selected = index),
            destinations: [
              for (final label in labels) NavigationDestination(icon: const Icon(Icons.apps), label: label),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsNothing);
    await tester.tap(find.byKey(const ValueKey('role-section-picker')));
    await tester.pumpAndSettle();
    expect(find.byType(ListTile), findsNWidgets(5));
    await tester.ensureVisible(find.text('الحساب'));
    await tester.tap(find.text('الحساب'));
    await tester.pumpAndSettle();
    expect(selected, 4);
    expect(find.byType(ListTile), findsNothing);
    expect(find.text('الحساب'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
