import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/theme/light_theme.dart';
import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:feniq/generated/app_localizations.dart';

void main() {
  testWidgets('large Arabic labels keep every tab on the bar, one line each, and every tab is reachable', (tester) async {
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
    // Every tab stays on the bar, each label on one line.
    expect(find.byType(NavigationBar), findsNothing);
    final bar = find.byKey(const ValueKey('role-tab-bar'));
    for (final label in labels) {
      expect(find.descendant(of: bar, matching: find.text(label)), findsOneWidget);
      final text = tester.widget<Text>(find.descendant(of: bar, matching: find.text(label)));
      expect(text.maxLines, 1);
    }
    await tester.tap(find.descendant(of: bar, matching: find.text('الحساب')));
    await tester.pumpAndSettle();
    expect(selected, 4);
    expect(tester.takeException(), isNull);
  });
}
