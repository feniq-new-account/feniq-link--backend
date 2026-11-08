import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/launch/early_launch_notice.dart';
import 'package:feniq/generated/app_localizations.dart';

void main() {
  Future<void> pumpNotice(WidgetTester tester, DateTime at, Locale locale) async {
    await tester.pumpWidget(MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: EarlyLaunchNotice(nowUtc: at)),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('positive Arabic early launch wording through November 30 Damascus', (tester) async {
    await pumpNotice(tester, DateTime.utc(2026, 11, 30, 20, 59), const Locale('ar'));
    expect(find.text('مرحلة الإطلاق المبكر'), findsOneWidget);
    expect(find.textContaining('يبدأ استقبال الطلبات في 1 كانون الأول'), findsOneWidget);
    expect(find.textContaining('تُضاف مستودعات جديدة باستمرار'), findsOneWidget);
    expect(find.textContaining('أنت من أوائل الصيادلة'), findsNothing);
    expect(find.byIcon(Icons.rocket_launch_outlined), findsOneWidget);
  });

  testWidgets('English translation shows the same early-launch window', (tester) async {
    await pumpNotice(tester, DateTime.utc(2026, 11, 15, 20, 59), const Locale('en'));
    expect(find.text('Early launch phase'), findsOneWidget);
    expect(find.textContaining('Orders open December 1'), findsOneWidget);
  });

  testWidgets('the badge disappears exactly at midnight December 1 Damascus', (tester) async {
    await pumpNotice(tester, DateTime.utc(2026, 11, 30, 21), const Locale('ar'));
    expect(find.textContaining('مرحلة الإطلاق المبكر'), findsNothing);
    expect(find.byIcon(Icons.rocket_launch_outlined), findsNothing);
  });
}
