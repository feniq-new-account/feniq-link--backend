import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/theme/dark_theme.dart';
import 'package:feniq/core/widgets/medicine_placeholder.dart';

void main() {
  Future<void> pumpPlaceholder(WidgetTester tester, Widget child, {ThemeData? theme}) async {
    await tester.pumpWidget(MaterialApp(theme: theme, home: Scaffold(body: Center(child: child))));
  }

  testWidgets('fills the box it is given and paints the pills', (tester) async {
    await pumpPlaceholder(tester, const SizedBox(width: 160, height: 100, child: MedicinePlaceholder()));

    expect(tester.getSize(find.byType(MedicinePlaceholder)), const Size(160, 100));
    expect(find.descendant(of: find.byType(MedicinePlaceholder), matching: find.byType(CustomPaint)), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('an explicit size is enough where the parent does not bound it', (tester) async {
    await pumpPlaceholder(
      tester,
      Row(mainAxisSize: MainAxisSize.min, children: const [MedicinePlaceholder(size: 44)]),
    );

    expect(tester.getSize(find.byType(MedicinePlaceholder)), const Size(44, 44));
    expect(tester.takeException(), isNull);
  });

  testWidgets('every dosage form paints without error', (tester) async {
    for (final form in ['', 'أقراص ملبسة', 'محافظ', 'محلول للحقن/حبابات', 'شراب', 'قطرة عينية', 'كريم', 'تحاميل', 'ظروف', 'بخاخ أنفي']) {
      await pumpPlaceholder(tester, SizedBox(width: 120, height: 90, child: MedicinePlaceholder(dosageForm: form)));
      expect(tester.takeException(), isNull, reason: form);
    }
  });

  testWidgets('paints in the dark theme too', (tester) async {
    await pumpPlaceholder(
      tester,
      const SizedBox(width: 72, height: 72, child: MedicinePlaceholder()),
      theme: DarkTheme.data,
    );

    expect(tester.takeException(), isNull);
  });
}
