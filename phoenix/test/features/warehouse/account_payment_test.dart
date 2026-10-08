import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_accounts_tab.dart';
import 'package:feniq/features/warehouse/presentation/widgets/account_payment.dart';
import 'package:feniq/generated/app_localizations.dart';

// The accounts table: one row per pharmacy with what it bought, paid and
// still owes, and "pay in full" / "part payment" right on the row.
class MockAccountsCubit extends MockCubit<WarehouseAccountsState> implements WarehouseAccountsCubit {}

final _row = WarehouseAccountRow(
  pharmacyId: 'p1',
  nameAr: 'صيدلية',
  nameEn: 'Pharmacy',
  balanceSyp: 100000,
  purchasesSyp: 250000,
  paidSyp: 150000,
  lastPaymentAt: DateTime.utc(2026, 10, 5),
);

final _sheetField = find.descendant(of: find.byType(AccountPartPaymentSheet), matching: find.byType(TextField));

void main() {
  late MockAccountsCubit cubit;

  setUp(() {
    cubit = MockAccountsCubit();
    when(() => cubit.load()).thenAnswer((_) async {});
    when(() => cubit.loadMore()).thenAnswer((_) async {});
    when(
      () => cubit.recordPayment(
        pharmacyId: any(named: 'pharmacyId'),
        amountSyp: any(named: 'amountSyp'),
        idempotencyKey: any(named: 'idempotencyKey'),
      ),
    ).thenAnswer((_) async => true);
  });

  Future<void> open(WidgetTester tester, WarehouseAccountRow row) async {
    whenListen(
      cubit,
      const Stream<WarehouseAccountsState>.empty(),
      initialState: WarehouseAccountsState(status: RepLoadStatus.loaded, accounts: [row]),
    );
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: BlocProvider<WarehouseAccountsCubit>.value(value: cubit, child: const WarehouseAccountsTab()),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('a row shows purchases, paid, owed and the last payment date', (tester) async {
    await open(tester, _row);
    expect(find.textContaining('Bought 250,000'), findsOneWidget);
    expect(find.textContaining('Paid 150,000'), findsOneWidget);
    expect(find.textContaining('Owes 100,000'), findsOneWidget);
    expect(find.textContaining('Last payment'), findsOneWidget);
  });

  testWidgets('pay in full asks to confirm, then records what is owed', (tester) async {
    await open(tester, _row);
    await tester.tap(find.widgetWithText(FilledButton, 'Pay in full'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Record a cash payment of'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Record payment'));
    await tester.pumpAndSettle();
    verify(
      () => cubit.recordPayment(
        pharmacyId: 'p1',
        amountSyp: 100000,
        idempotencyKey: any(named: 'idempotencyKey'),
      ),
    ).called(1);
  });

  testWidgets('cancelling the confirm records nothing', (tester) async {
    await open(tester, _row);
    await tester.tap(find.widgetWithText(FilledButton, 'Pay in full'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    verifyNever(
      () => cubit.recordPayment(
        pharmacyId: any(named: 'pharmacyId'),
        amountSyp: any(named: 'amountSyp'),
        idempotencyKey: any(named: 'idempotencyKey'),
      ),
    );
  });

  testWidgets('a part payment takes Arabic-Indic digits and shows what is left', (tester) async {
    await open(tester, _row);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Part payment'));
    await tester.pumpAndSettle();
    await tester.enterText(_sheetField, '٤٠٠٠٠');
    await tester.pump();
    expect(find.textContaining('Left: 60,000'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Record payment'));
    await tester.pumpAndSettle();
    verify(
      () => cubit.recordPayment(
        pharmacyId: 'p1',
        amountSyp: 40000,
        idempotencyKey: any(named: 'idempotencyKey'),
      ),
    ).called(1);
  });

  testWidgets('a part payment of the whole amount or zero is refused', (tester) async {
    await open(tester, _row);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Part payment'));
    await tester.pumpAndSettle();
    await tester.enterText(_sheetField, '100000');
    await tester.tap(find.widgetWithText(FilledButton, 'Record payment'));
    await tester.pumpAndSettle();
    expect(find.textContaining('below the amount owed'), findsOneWidget);
    verifyNever(
      () => cubit.recordPayment(
        pharmacyId: any(named: 'pharmacyId'),
        amountSyp: any(named: 'amountSyp'),
        idempotencyKey: any(named: 'idempotencyKey'),
      ),
    );
  });

  testWidgets('a settled pharmacy has no pay buttons', (tester) async {
    await open(tester, WarehouseAccountRow(pharmacyId: 'p2', nameAr: 'ب', nameEn: 'B', balanceSyp: 0));
    expect(find.text('Pay in full'), findsNothing);
    expect(find.text('No payments yet'), findsOneWidget);
  });
}
