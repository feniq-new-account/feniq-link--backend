import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/warehouse/presentation/widgets/daily_receipts_card.dart';
import 'package:feniq/generated/app_localizations.dart';

Widget _app(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets("today's net, what was received by method, and who took what", (tester) async {
    await tester.pumpWidget(_app(DailyReceiptsCard(load: () async => {
          'netSyp': 151000, 'receivedSyp': 158000, 'receivedCount': 4, 'reversedSyp': 7000, 'reversedCount': 1,
          'byMethod': {'cash': 108000, 'bank_transfer': 50000},
          'byRecorder': [
            {'name': 'Manager', 'role': 'owner', 'amountSyp': 108000, 'count': 3},
            {'name': 'Accountant', 'role': 'accountant', 'amountSyp': 50000, 'count': 1},
          ],
        })));
    await tester.pumpAndSettle();
    expect(find.text('مقبوضات اليوم'), findsOneWidget);
    expect(find.textContaining('الصافي: 151,000'), findsOneWidget);
    expect(find.textContaining(RegExp(r'^المقبوض: 158,000.* · عدد الدفعات 4$')), findsOneWidget);
    expect(find.textContaining('الملغى: −7,000'), findsOneWidget);
    expect(find.textContaining('نقداً: 108,000'), findsOneWidget);
    expect(find.textContaining('Manager (مدير): 108,000'), findsOneWidget);
    expect(find.textContaining('Accountant (محاسب): 50,000'), findsOneWidget);
  });

  testWidgets('a quiet day says so, and a failed load says it could not load', (tester) async {
    await tester.pumpWidget(_app(DailyReceiptsCard(load: () async => {'receivedCount': 0, 'reversedCount': 0})));
    await tester.pumpAndSettle();
    expect(find.text('لم يُقبض أي مبلغ اليوم.'), findsOneWidget);

    await tester.pumpWidget(_app(DailyReceiptsCard(key: const ValueKey('b'), load: () async => throw Exception('down'))));
    await tester.pumpAndSettle();
    expect(find.text('تعذّر تحميل مقبوضات اليوم.'), findsOneWidget);
  });

  testWidgets("today's net is compared with yesterday's, read for the day before", (tester) async {
    String? asked;
    await tester.pumpWidget(_app(DailyReceiptsCard(
      key: const ValueKey('c'),
      load: () async => {'date': '2026-12-01', 'netSyp': 50000, 'receivedSyp': 50000, 'receivedCount': 1, 'reversedCount': 0},
      loadDay: (date) async {
        asked = date;
        return {'date': date, 'netSyp': 80000};
      },
    )));
    await tester.pumpAndSettle();
    expect(asked, '2026-11-30');
    expect(find.text('الصافي مقارنة بالأمس'), findsOneWidget);
    expect(find.text('أمس'), findsOneWidget);
    expect(find.textContaining('80,000'), findsOneWidget);
  });
}
