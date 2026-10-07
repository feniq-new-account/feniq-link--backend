import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/widgets/quantity_stepper.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_order_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_orders_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_order_detail_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_orders_tab.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockWarehouseOrdersCubit extends MockCubit<WarehouseOrdersState> implements WarehouseOrdersCubit {}

class MockWarehouseOrderDetailCubit extends MockCubit<WarehouseOrderDetailState> implements WarehouseOrderDetailCubit {}

Widget _app(Widget child) => MaterialApp(
  locale: const Locale('en'),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: child,
);

const _pharmacy = WarehouseOrderPharmacy(
  id: 'p1',
  nameAr: 'صيدلية الياسمين',
  nameEn: 'Al-Yasmin Pharmacy',
  city: 'Latakia',
  phone: '0931000000',
);

const _line = WarehouseOrderItem(id: 'i1', productNameAr: 'دواء', productNameEn: 'PANADOL 500', quantity: 10, discountPrice: 100);

WarehouseOrderDetail _detail({String status = 'pending', bool seal = false}) => WarehouseOrderDetail(
  id: 'o1',
  orderNumber: 7,
  status: status,
  items: const [_line],
  pharmacy: _pharmacy,
  totalPrice: 1000,
  finalPrice: 1000,
  commissionAmount: 5,
  warehouseNetSyp: 995,
  repCommission: const WarehouseRepCommission(rate: 2, repAmount: 10, feniqAmount: 5, savingAmount: 5),
  requiresDeliverySealPhoto: seal,
);

void main() {
  group('WarehouseOrdersTab', () {
    late MockWarehouseOrdersCubit cubit;

    setUp(() {
      cubit = MockWarehouseOrdersCubit();
      when(() => cubit.load()).thenAnswer((_) async {});
      when(() => cubit.loadMore()).thenAnswer((_) async {});
    });

    Future<void> pump(WidgetTester tester, WarehouseOrdersState state) async {
      whenListen(cubit, const Stream<WarehouseOrdersState>.empty(), initialState: state);
      await tester.pumpWidget(
        _app(Scaffold(body: BlocProvider<WarehouseOrdersCubit>.value(value: cubit, child: const WarehouseOrdersTab()))),
      );
      await tester.pump();
    }

    testWidgets('lists the orders with the status tabs and the forward button', (tester) async {
      await pump(
        tester,
        const WarehouseOrdersState(
          status: RepLoadStatus.loaded,
          orders: [
            WarehouseOrderSummary(id: 'o1', orderNumber: 7, status: 'pending', finalPrice: 1000, itemCount: 3, pharmacy: _pharmacy),
          ],
        ),
      );
      expect(find.text('All'), findsOneWidget);
      expect(find.text('Order #7'), findsOneWidget);
      expect(find.text('Al-Yasmin Pharmacy'), findsOneWidget);
      expect(find.text('Approve & send'), findsOneWidget);
    });

    testWidgets('the forward step asks first, then advances', (tester) async {
      when(() => cubit.advance('o1')).thenAnswer((_) async => true);
      await pump(
        tester,
        const WarehouseOrdersState(
          status: RepLoadStatus.loaded,
          orders: [WarehouseOrderSummary(id: 'o1', orderNumber: 7, status: 'pending', finalPrice: 1000, itemCount: 1)],
        ),
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Approve & send'));
      await tester.pumpAndSettle();
      expect(find.text('Approve and send this order?'), findsOneWidget);
      verifyNever(() => cubit.advance(any()));

      await tester.tap(find.widgetWithText(TextButton, 'Approve & send').last);
      await tester.pumpAndSettle();
      verify(() => cubit.advance('o1')).called(1);
    });

    testWidgets('an order on its way offers "delivered"; a delivered one offers nothing', (tester) async {
      await pump(
        tester,
        const WarehouseOrdersState(
          status: RepLoadStatus.loaded,
          filter: null,
          orders: [
            WarehouseOrderSummary(id: 'o1', orderNumber: 7, status: 'out_for_delivery', finalPrice: 1000, itemCount: 1),
            WarehouseOrderSummary(id: 'o2', orderNumber: 8, status: 'delivered', finalPrice: 1000, itemCount: 1),
          ],
        ),
      );
      expect(find.widgetWithText(FilledButton, 'Mark as delivered'), findsOneWidget);
      expect(find.byType(FilledButton), findsOneWidget);
    });

    testWidgets('an empty tab says new orders will show up here', (tester) async {
      await pump(tester, const WarehouseOrdersState(status: RepLoadStatus.loaded));
      expect(find.text('No orders here'), findsOneWidget);
    });
  });

  group('WarehouseOrderDetailView', () {
    late MockWarehouseOrderDetailCubit cubit;

    setUp(() {
      cubit = MockWarehouseOrderDetailCubit();
      when(() => cubit.load()).thenAnswer((_) async {});
    });

    Future<void> pump(WidgetTester tester, WarehouseOrderDetailState state) async {
      whenListen(cubit, const Stream<WarehouseOrderDetailState>.empty(), initialState: state);
      await tester.pumpWidget(
        _app(BlocProvider<WarehouseOrderDetailCubit>.value(value: cubit, child: const WarehouseOrderDetailView())),
      );
      await tester.pump();
    }

    testWidgets('shows the pharmacy, the items, the rep split and both actions', (tester) async {
      await pump(tester, WarehouseOrderDetailState(status: RepLoadStatus.loaded, order: _detail()));
      expect(find.text('Order #7'), findsOneWidget);
      expect(find.text('Al-Yasmin Pharmacy'), findsOneWidget);
      expect(find.text('Call'), findsOneWidget);
      expect(find.textContaining('PANADOL 500'), findsOneWidget);
      expect(find.text('Rep commission (2%)'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('You keep'), 100);
      expect(find.text('You keep'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Edit items'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Approve & send'), findsOneWidget);
    });

    testWidgets('editing shows a stepper and a remove button per line', (tester) async {
      await pump(tester, WarehouseOrderDetailState(status: RepLoadStatus.loaded, order: _detail(), isEditing: true));
      expect(find.byType(QuantityStepper), findsOneWidget);
      expect(find.text('Remove'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Save changes'), findsOneWidget);
    });

    testWidgets('an order on its way waiting for the seal photo cannot be marked delivered yet', (tester) async {
      await pump(
        tester,
        WarehouseOrderDetailState(status: RepLoadStatus.loaded, order: _detail(status: 'out_for_delivery', seal: true)),
      );
      expect(find.text("Waiting for the pharmacy's seal photo before delivery."), findsOneWidget);
      final button = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Mark as delivered'));
      expect(button.onPressed, isNull);
      expect(find.text('Edit items'), findsNothing);
    });
  });
}
