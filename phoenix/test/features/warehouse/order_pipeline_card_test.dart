import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/warehouse/presentation/widgets/order_pipeline_card.dart';
import 'package:feniq/generated/app_localizations.dart';

Widget _app(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets("today's orders: each step's count in words, and the 48-hour warning", (tester) async {
    await tester.pumpWidget(_app(OrderPipelineCard(load: () async => {
          'pending': {'count': 3, 'amountSyp': 1},
          'accepted': {'count': 2, 'amountSyp': 1},
          'onTheWay': {'count': 1, 'amountSyp': 1},
          'deliveredToday': {'count': 4, 'amountSyp': 1},
          'stalePendingCount': 1,
        })));
    await tester.pumpAndSettle();
    expect(find.text('طلبات اليوم'), findsOneWidget);
    expect(find.text('بانتظار الموافقة'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('سُلّمت اليوم'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('بانتظار الموافقة منذ أكثر من 48 ساعة: 1'), findsOneWidget);
  });

  testWidgets('a quiet day says so, and a failed load says it could not load', (tester) async {
    Map<String, dynamic> zero() => {'count': 0, 'amountSyp': 0};
    await tester.pumpWidget(_app(OrderPipelineCard(load: () async => {
          'pending': zero(), 'accepted': zero(), 'onTheWay': zero(), 'deliveredToday': zero(), 'stalePendingCount': 0,
        })));
    await tester.pumpAndSettle();
    expect(find.text('لا توجد طلبات مفتوحة، ولم يُسلَّم شيء اليوم.'), findsOneWidget);

    await tester.pumpWidget(_app(OrderPipelineCard(key: const ValueKey('b'), load: () async => throw Exception('down'))));
    await tester.pumpAndSettle();
    expect(find.text('تعذّر تحميل طلبات اليوم.'), findsOneWidget);
  });
}
