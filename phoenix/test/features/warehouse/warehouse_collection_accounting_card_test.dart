import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:feniq/features/warehouse/presentation/widgets/warehouse_collection_accounting_card.dart';

Map<String, dynamic> journal({
  Map<String, dynamic>? summary,
}) => {
  'success': true,
  'summary': summary,
};

Map<String, dynamic> posted({int amount = 125000}) => {
  'model': 'collection_v2',
  'originalSyp': amount,
  'feniqSyp': 75000,
  'repSyp': 50000,
  'correctionsFeniqSyp': -2000,
  'returnCreditAvailableSyp': 3000,
  'returnCreditLiabilitySyp': 7000,
  'invoiceStates': {'open': 2, 'partial': 1, 'paid': 5, 'void': 0},
};

Future<void> showCard(
  WidgetTester tester,
  CollectionJournalLoader loader,
) async {
  await tester.pumpWidget(MaterialApp(
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: Scaffold(body: SingleChildScrollView(
      child: WarehouseCollectionAccountingCard(loadJournal: loader),
    )),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('legacy warehouse reports inactive collection, not fake zero commission',
      (tester) async {
    await showCard(tester, (_) async => journal());
    expect(find.textContaining('غير مفعّل'), findsOneWidget);
    expect(find.text('0 ل.س'), findsNothing);
    expect(find.text('حصة فينيق'), findsNothing);
    expect(find.byIcon(Icons.payments_outlined), findsNothing);
  });

  testWidgets('period amounts are separate from current all-time credit',
      (tester) async {
    final periods = <String>[];
    await showCard(tester, (period) async {
      periods.add(period);
      return journal(summary: posted());
    });
    expect(periods, ['month']);
    expect(find.text('125,000 ل.س'), findsOneWidget);
    expect(find.text('75,000 ل.س'), findsOneWidget);
    expect(find.text('3,000 ل.س'), findsOneWidget);
    expect(find.textContaining('حالات الفواتير'), findsOneWidget);
    expect(find.text('مفتوحة: 2'), findsOneWidget);
    await tester.tap(find.text('الأسبوع'));
    await tester.pumpAndSettle();
    expect(periods, ['month', 'week']);
  });

  testWidgets('refresh errors clear old financial numbers, never present stale data',
      (tester) async {
    var call = 0;
    await showCard(tester, (_) async {
      call++;
      if (call == 1) return journal(summary: posted());
      throw StateError('network unavailable');
    });
    expect(find.text('125,000 ل.س'), findsOneWidget);
    await tester.tap(find.byTooltip('تحديث الأرقام'));
    await tester.pumpAndSettle();
    expect(find.text('125,000 ل.س'), findsNothing);
    expect(find.textContaining('لا تُعتمد الأرقام السابقة'), findsOneWidget);
  });

  testWidgets('malformed money never silently displays as zero',
      (tester) async {
    await showCard(tester, (_) async => journal(summary: {
      ...posted(),
      'feniqSyp': null,
    }));
    expect(find.text('—'), findsWidgets);
    expect(find.text('75,000 ل.س'), findsNothing);
  });
}
