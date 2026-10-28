import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/debts/data/models/debt_detail_model.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_orders_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_reps_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_returns_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_reps_tab.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_return_detail_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_shell_view.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_statement_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockReturnDetail extends MockCubit<WarehouseReturnDetailState> implements WarehouseReturnDetailCubit {}

class MockStatement extends MockCubit<WarehouseStatementState> implements WarehouseStatementCubit {}

class MockReps extends MockCubit<WarehouseRepsState> implements WarehouseRepsCubit {}

class MockOrders extends MockCubit<WarehouseOrdersState> implements WarehouseOrdersCubit {}

class MockReturns extends MockCubit<WarehouseReturnsState> implements WarehouseReturnsCubit {}

class MockAccounts extends MockCubit<WarehouseAccountsState> implements WarehouseAccountsCubit {}

Widget _app(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  locale: locale,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: child,
);

void main() {
  testWidgets('a pending return shows the credit it would add, and approving asks first', (tester) async {
    final cubit = MockReturnDetail();
    whenListen(
      cubit,
      const Stream<WarehouseReturnDetailState>.empty(),
      initialState: const WarehouseReturnDetailState(
        status: RepLoadStatus.loaded,
        creditPreviewSyp: 4000,
        returnRequest: WarehouseReturn(
          id: 'x1',
          status: 'pending',
          orderNumber: 9,
          pharmacyNameEn: 'Al-Yasmin Pharmacy',
          items: [WarehouseReturnItem(quantity: 2, reasonType: 'damaged', productNameEn: 'PANADOL')],
        ),
      ),
    );
    when(() => cubit.approve()).thenAnswer((_) async => true);
    await tester.pumpWidget(_app(BlocProvider<WarehouseReturnDetailCubit>.value(value: cubit, child: const WarehouseReturnDetailView())));
    await tester.pump();

    expect(find.text('Return on order #9'), findsOneWidget);
    expect(find.textContaining('If you approve, the pharmacy is credited'), findsOneWidget);
    expect(find.textContaining('PANADOL'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Approve'));
    await tester.pumpAndSettle();
    expect(find.text('Approve this return?'), findsOneWidget);
    verifyNever(() => cubit.approve());
    await tester.tap(find.widgetWithText(TextButton, 'Approve'));
    await tester.pumpAndSettle();
    verify(() => cubit.approve()).called(1);
  });

  testWidgets('rejecting a return needs a written reason', (tester) async {
    final cubit = MockReturnDetail();
    whenListen(
      cubit,
      const Stream<WarehouseReturnDetailState>.empty(),
      initialState: const WarehouseReturnDetailState(
        status: RepLoadStatus.loaded,
        returnRequest: WarehouseReturn(id: 'x1', status: 'pending', items: []),
      ),
    );
    when(() => cubit.reject(any())).thenAnswer((_) async => true);
    await tester.pumpWidget(_app(BlocProvider<WarehouseReturnDetailCubit>.value(value: cubit, child: const WarehouseReturnDetailView())));
    await tester.pump();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Reject'));
    await tester.pumpAndSettle();
    final confirm = find.widgetWithText(TextButton, 'Reject');
    expect(tester.widget<TextButton>(confirm).onPressed, isNull);
    await tester.enterText(find.byType(TextField), 'Not from our stock');
    await tester.pump();
    await tester.tap(confirm);
    await tester.pumpAndSettle();
    verify(() => cubit.reject('Not from our stock')).called(1);
  });

  testWidgets('the statement shows what the pharmacy owes, and a payment needs a valid amount', (tester) async {
    final cubit = MockStatement();
    whenListen(
      cubit,
      const Stream<WarehouseStatementState>.empty(),
      initialState: const WarehouseStatementState(
        status: RepLoadStatus.loaded,
        statement: WarehouseStatement(
          pharmacyNameAr: 'صيدلية',
          pharmacyNameEn: 'Al-Yasmin Pharmacy',
          closingSyp: 5000,
          summary: StatementSummary(chargesSyp: 5000, paymentsSyp: 0, returnCreditsSyp: 0, adjustmentsSyp: 0),
          rows: [],
        ),
      ),
    );
    when(() => cubit.discardPendingPayment()).thenReturn(null);
    await tester.pumpWidget(_app(BlocProvider<WarehouseStatementCubit>.value(value: cubit, child: const WarehouseStatementView())));
    await tester.pump();
    expect(find.textContaining('Owes'), findsOneWidget);

    await tester.tap(find.text('Record a payment'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Record a payment'));
    await tester.pump();
    expect(find.text('Enter a valid number'), findsOneWidget);
    verifyNever(() => cubit.recordPayment(amountSyp: any(named: 'amountSyp'), method: any(named: 'method')));
  });

  testWidgets('a rep card shows the rate, the numbers, and an off badge', (tester) async {
    final cubit = MockReps();
    whenListen(
      cubit,
      const Stream<WarehouseRepsState>.empty(),
      initialState: const WarehouseRepsState(
        status: RepLoadStatus.loaded,
        reps: [
          WarehouseRep(id: 'r1', name: 'Ahmad', phone: '0940000201', commissionRate: 2, pharmacyCount: 3, visits30d: 7, isActive: false),
        ],
      ),
    );
    await tester.pumpWidget(_app(Scaffold(body: BlocProvider<WarehouseRepsCubit>.value(value: cubit, child: const WarehouseRepsTab()))));
    await tester.pump();
    expect(find.text('Ahmad'), findsOneWidget);
    expect(find.text('2%'), findsOneWidget);
    expect(find.text('Switched off'), findsOneWidget);
    expect(find.text('3 pharmacies · 7 visits in 30 days'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    expect(find.text('Edit commission'), findsOneWidget);
    expect(find.text('Switch the rep on'), findsOneWidget);
    expect(find.text('New password'), findsOneWidget);
  });

  testWidgets('the warehouse shell fits its five tabs on a 360dp phone in Arabic', (tester) async {
    tester.view.physicalSize = const Size(360 * 3, 780 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final orders = MockOrders();
    whenListen(orders, const Stream<WarehouseOrdersState>.empty(), initialState: const WarehouseOrdersState(status: RepLoadStatus.loaded));
    when(() => orders.load()).thenAnswer((_) async {});
    await tester.pumpWidget(
      _app(
        MultiBlocProvider(
          providers: [
            BlocProvider<WarehouseOrdersCubit>.value(value: orders),
            BlocProvider<WarehouseReturnsCubit>.value(value: MockReturns()),
            BlocProvider<WarehouseAccountsCubit>.value(value: MockAccounts()),
            BlocProvider<WarehouseRepsCubit>.value(value: MockReps()),
          ],
          child: const WarehouseShellView(),
        ),
        locale: const Locale('ar'),
      ),
    );
    await tester.pump();
    final bar = find.byType(NavigationBar);
    final compact = bar.evaluate().isEmpty;
    if (compact) {
      await tester.tap(find.byKey(const ValueKey('role-section-picker')));
      await tester.pumpAndSettle();
      expect(find.byType(ListTile), findsNWidgets(5));
    }
    for (final label in ['الطلبيات', 'المرتجعات', 'الحسابات', 'المناديب', 'الحساب']) {
      expect(find.descendant(of: compact ? find.byType(ListTile) : bar, matching: find.text(label)), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });
}
