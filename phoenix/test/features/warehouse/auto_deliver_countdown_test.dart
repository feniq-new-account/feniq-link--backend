import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_orders_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_orders_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/auto_deliver_label.dart';
import 'package:feniq/features/warehouse/presentation/widgets/warehouse_order_card.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/generated/app_localizations_ar.dart';
import 'package:feniq/generated/app_localizations_en.dart';

class _Repo extends Mock implements WarehouseOrdersRepository {}

// Phase B: an order on the road closes as delivered - and becomes the
// pharmacy's debt - a day after it left unless someone marks it. The manager
// sees when, on the row and on the order. The deadline itself comes from the
// server (autoDeliverAt), so the app never re-implements the 24-hour rule.
void main() {
  final ar = AppLocalizationsAr();
  final en = AppLocalizationsEn();
  final now = DateTime(2026, 11, 20, 10);

  group('autoDeliverLabel', () {
    test('no deadline, or not on the road any more, no label', () {
      expect(autoDeliverLabel(ar, null, now, status: 'out_for_delivery'), isNull);
      expect(autoDeliverLabel(ar, now.add(const Duration(hours: 2)), now, status: 'delivered'), isNull);
    });

    test('whole hours, rounded down, in Arabic plural forms', () {
      expect(autoDeliverLabel(ar, now.add(const Duration(hours: 5, minutes: 50)), now, status: 'out_for_delivery'), 'سيُسجَّل مُسلَّماً تلقائياً بعد 5 ساعات');
      expect(autoDeliverLabel(ar, now.add(const Duration(hours: 2, minutes: 10)), now, status: 'out_for_delivery'), 'سيُسجَّل مُسلَّماً تلقائياً بعد ساعتين');
      expect(autoDeliverLabel(ar, now.add(const Duration(hours: 1)), now, status: 'out_for_delivery'), 'سيُسجَّل مُسلَّماً تلقائياً بعد ساعة');
      expect(autoDeliverLabel(ar, now.add(const Duration(hours: 23, minutes: 59)), now, status: 'out_for_delivery'), 'سيُسجَّل مُسلَّماً تلقائياً بعد 23 ساعة');
      expect(autoDeliverLabel(en, now.add(const Duration(hours: 5)), now, status: 'out_for_delivery'), 'Marked delivered automatically in 5 hours');
    });

    test('under an hour, minutes rounded up', () {
      expect(autoDeliverLabel(ar, now.add(const Duration(minutes: 39, seconds: 10)), now, status: 'out_for_delivery'), 'سيُسجَّل مُسلَّماً تلقائياً بعد 40 دقيقة');
      expect(autoDeliverLabel(ar, now.add(const Duration(seconds: 20)), now, status: 'out_for_delivery'), 'سيُسجَّل مُسلَّماً تلقائياً بعد دقيقة');
    });

    test('a passed deadline reads "within the hour" (the job runs hourly)', () {
      expect(autoDeliverLabel(ar, now, now, status: 'out_for_delivery'), 'سيُسجَّل مُسلَّماً تلقائياً خلال ساعة');
      expect(autoDeliverLabel(ar, now.subtract(const Duration(minutes: 30)), now, status: 'out_for_delivery'), 'سيُسجَّل مُسلَّماً تلقائياً خلال ساعة');
    });
  });

  group('models', () {
    test('list row, detail and advance result read autoDeliverAt', () {
      const at = '2026-11-21T08:00:00.000Z';
      final row = WarehouseOrderSummary.fromJson({'id': 'o1', 'orderNumber': 7, 'status': 'out_for_delivery', 'autoDeliverAt': at});
      expect(row.autoDeliverAt, DateTime.parse(at).toLocal());
      final detail = WarehouseOrderDetail.fromJson({'order': {'id': 'o1', 'orderNumber': 7, 'status': 'out_for_delivery', 'autoDeliverAt': at}});
      expect(detail.autoDeliverAt, DateTime.parse(at).toLocal());
      final advanced = AdvancedOrderStatus.fromJson({'order': {'status': 'out_for_delivery', 'autoDeliverAt': at}});
      expect(advanced.autoDeliverAt, DateTime.parse(at).toLocal());
      expect(WarehouseOrderSummary.fromJson({'id': 'o2', 'status': 'pending'}).autoDeliverAt, isNull);
    });
  });

  test('sending an order on its way starts the countdown on its row; delivering clears it', () async {
    final repo = _Repo();
    final at = DateTime(2026, 11, 21, 10);
    when(() => repo.getOrders(status: 'pending')).thenAnswer((_) async => const WarehouseOrdersPage(orders: [
          WarehouseOrderSummary(id: 'o1', orderNumber: 1, status: 'confirmed', finalPrice: 1000, itemCount: 1),
        ]));
    when(() => repo.advance('o1', expectedStatus: 'confirmed', targetStatus: 'out_for_delivery'))
        .thenAnswer((_) async => AdvancedOrderStatus(status: 'out_for_delivery', autoDeliverAt: at));
    when(() => repo.advance('o1', expectedStatus: 'out_for_delivery', targetStatus: 'delivered'))
        .thenAnswer((_) async => const AdvancedOrderStatus(status: 'delivered'));
    final cubit = WarehouseOrdersCubit(repository: repo);
    await cubit.load();
    await cubit.advance('o1');
    expect(cubit.state.orders.single.autoDeliverAt, at);
    await cubit.advance('o1');
    expect(cubit.state.orders.single.status, 'delivered');
    expect(cubit.state.orders.single.autoDeliverAt, isNull);
    await cubit.close();
  });

  test('coming back from the detail screen keeps the deadline on the row in step', () async {
    final repo = _Repo();
    final at = DateTime(2026, 11, 21, 10);
    when(() => repo.getOrders(status: 'pending')).thenAnswer((_) async => WarehouseOrdersPage(orders: [
          WarehouseOrderSummary(id: 'o1', orderNumber: 1, status: 'out_for_delivery', finalPrice: 1000, itemCount: 1, autoDeliverAt: at),
          const WarehouseOrderSummary(id: 'o2', orderNumber: 2, status: 'confirmed', finalPrice: 1000, itemCount: 1),
        ]));
    final cubit = WarehouseOrdersCubit(repository: repo);
    await cubit.load();
    cubit.applyDetail(WarehouseOrderDetail.fromJson({'order': {'id': 'o1', 'orderNumber': 1, 'status': 'delivered'}}));
    cubit.applyDetail(WarehouseOrderDetail.fromJson({'order': {'id': 'o2', 'orderNumber': 2, 'status': 'out_for_delivery', 'autoDeliverAt': at.toUtc().toIso8601String()}}));
    expect(cubit.state.orders[0].autoDeliverAt, isNull);
    expect(cubit.state.orders[1].autoDeliverAt, at);
    await cubit.close();
  });

  Widget card(WarehouseOrderSummary order) => MaterialApp(
        locale: const Locale('ar'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: WarehouseOrderCard(order: order, onTap: () {}, onAdvance: () {}, now: now)),
      );

  testWidgets('the row of an order on the road shows the countdown', (tester) async {
    await tester.pumpWidget(card(WarehouseOrderSummary(
      id: 'o1', orderNumber: 1, status: 'out_for_delivery', finalPrice: 1000, itemCount: 1,
      autoDeliverAt: now.add(const Duration(hours: 3, minutes: 20)),
    )));
    expect(find.byKey(const ValueKey('auto-deliver-countdown')), findsOneWidget);
    expect(find.text('سيُسجَّل مُسلَّماً تلقائياً بعد 3 ساعات'), findsOneWidget);
  });

  testWidgets('any other row shows none', (tester) async {
    await tester.pumpWidget(card(const WarehouseOrderSummary(
      id: 'o1', orderNumber: 1, status: 'confirmed', finalPrice: 1000, itemCount: 1,
    )));
    expect(find.byKey(const ValueKey('auto-deliver-countdown')), findsNothing);
  });
}
