import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:feniq/features/warehouse/presentation/widgets/warehouse_cash_custody_card.dart';

Map<String, dynamic> custodyResponse({
  bool enabled = true,
  bool ready = true,
  int? netDue = 34000,
  int gross = 60000,
  List<Map<String, dynamic>> movements = const [],
  List<Map<String, dynamic>> receipts = const [],
  List<Map<String, dynamic>> custody = const [],
  bool truncated = false,
}) => {
  'success': true,
  'writerEnabled': enabled,
  'asOf': '2026-11-08T01:00:00Z',
  'summary': {
    'ready': ready,
    'grossCollectedSyp': gross,
    'originalCommissionSyp': ready ? 6000 : null,
    'netWarehouseDueSyp': ready ? netDue : null,
    'remittedSyp': 20000,
    'blockers': ready ? [] : [{'code': 'CUSTODY_FROZEN_CONTRACT_REQUIRED'}],
  },
  'movements': movements,
  'receipts': receipts,
  'custody': custody,
  'custodyTruncated': truncated,
};

Future<void> showCard(WidgetTester tester, CashCustodyLoader loader) async {
  await tester.pumpWidget(MaterialApp(
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: Scaffold(body: SingleChildScrollView(
      child: WarehouseCashCustodyCard(loadCustody: loader),
    )),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('disabled and empty writer is not represented as active zero collection',
      (tester) async {
    await showCard(tester, () async => custodyResponse(
      enabled: false, gross: 0, netDue: 0,
    ));
    expect(find.textContaining('غير مفعّل'), findsOneWidget);
    expect(find.text('0 ل.س'), findsNothing);
    expect(find.text('الصافي المستحق للمستودع'), findsNothing);
  });

  testWidgets('server totals and pending transfer are distinct and read only',
      (tester) async {
    await showCard(tester, () async => custodyResponse(
      movements: [
        {'status': 'pending', 'kind': 'transfer', 'amountSyp': 34000},
      ],
      receipts: [{'status': 'approved'}],
    ));
    expect(find.text('60,000 ل.س'), findsOneWidget);
    expect(find.text('6,000 ل.س'), findsOneWidget);
    expect(find.text('20,000 ل.س'), findsOneWidget);
    expect(find.text('34,000 ل.س'), findsNWidgets(2));
    expect(find.text('بانتظار تأكيد المحاسب'), findsOneWidget);
    expect(find.textContaining('الحوالة المعلقة لا تُحسب مسددة'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('blocked reconciliation hides net rather than fabricating a balance',
      (tester) async {
    await showCard(tester, () async => custodyResponse(
      ready: false, netDue: null,
      receipts: [{'status': 'approved'}],
    ));
    expect(find.textContaining('غير متاح لحين اكتمال مطابقة المصادر'), findsOneWidget);
    expect(find.text('الصافي المستحق للمستودع'), findsOneWidget);
    expect(find.text('—'), findsWidgets);
    expect(find.text('34,000 ل.س'), findsNothing);
    expect(find.text('60,000 ل.س'), findsOneWidget);
  });

  testWidgets('disabled writer retains historical collections with explicit warning',
      (tester) async {
    await showCard(tester, () async => custodyResponse(
      enabled: false,
      receipts: [{'status': 'approved'}],
    ));
    expect(find.textContaining('إدخال تحصيلات فينيق الجديدة متوقف'), findsOneWidget);
    expect(find.text('60,000 ل.س'), findsOneWidget);
  });

  testWidgets('server deadline flags count 24h and 48h without local clock inference',
      (tester) async {
    await showCard(tester, () async => custodyResponse(
      receipts: [{'status': 'approved'}],
      custody: [
        {'targetMissed': true, 'overdue': true},
        {'targetMissed': true, 'overdue': false},
      ],
      truncated: true,
    ));
    expect(find.textContaining('تجاوز هدف 24 ساعة: ≥2'), findsOneWidget);
    expect(find.textContaining('48 ساعة: ≥1'), findsOneWidget);
    expect(find.textContaining('أعداد من الصفحة المتاحة'), findsOneWidget);
  });

  testWidgets('failed refresh clears stale cash figures and retries safely',
      (tester) async {
    var calls = 0;
    await showCard(tester, () async {
      calls++;
      if (calls == 2) throw StateError('connection lost');
      return custodyResponse(receipts: [{'status': 'approved'}]);
    });
    expect(find.text('60,000 ل.س'), findsOneWidget);
    await tester.tap(find.byTooltip('تحديث التحويلات'));
    await tester.pumpAndSettle();
    expect(find.text('60,000 ل.س'), findsNothing);
    expect(find.textContaining('تم إخفاء الأرقام السابقة'), findsOneWidget);
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(calls, 3);
    expect(find.text('60,000 ل.س'), findsOneWidget);
  });

  testWidgets('narrow RTL manager layout does not overflow', (tester) async {
    tester.view.physicalSize = const Size(320 * 3, 750 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await showCard(tester, () async => custodyResponse(
      receipts: [{'status': 'approved'}],
    ));
    expect(find.text('34,000 ل.س'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
