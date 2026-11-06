import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/launch/early_launch_notice.dart';

void main() {
  Future<void> pumpNotice(WidgetTester tester, DateTime at, Locale locale) async {
    await tester.pumpWidget(MaterialApp(
      locale: locale,
      home: Scaffold(body: EarlyLaunchNotice(nowUtc: at)),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('positive Arabic early launch wording until end of November 15 Damascus', (tester) async {
    await pumpNotice(tester, DateTime.utc(2026, 11, 15, 20, 59), const Locale('ar'));
    expect(find.text('مرحلة الإطلاق المبكر • حتى 15 تشرين الثاني'), findsOneWidget);
    expect(find.textContaining('والقادم أكبر.'), findsOneWidget);
    expect(find.byIcon(Icons.rocket_launch_outlined), findsOneWidget);
  });

  testWidgets('English translation shows the same early-launch window', (tester) async {
    await pumpNotice(tester, DateTime.utc(2026, 11, 15, 20, 59), const Locale('en'));
    expect(find.text('Early launch • through November 15'), findsOneWidget);
  });

  testWidgets('the badge disappears exactly at midnight November 16 Damascus', (tester) async {
    await pumpNotice(tester, DateTime.utc(2026, 11, 15, 21), const Locale('ar'));
    expect(find.textContaining('مرحلة الإطلاق المبكر'), findsNothing);
    expect(find.byIcon(Icons.rocket_launch_outlined), findsNothing);
  });
}
