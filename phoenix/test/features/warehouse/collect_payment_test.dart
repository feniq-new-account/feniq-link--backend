import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_orders_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_orders_tab.dart';
import 'package:feniq/generated/app_localizations.dart';

// "Delivered" asks whether it was paid - all, part, or later - and records
// the payment right after the delivery; closing the sheet delivers nothing.
class MockWarehouseOrdersCubit extends MockCubit<WarehouseOrdersState> implements WarehouseOrdersCubit {}

class MockManagementRepository extends Mock implements WarehouseManagementRepository {}

const _order = WarehouseOrderSummary(
  id: 'o1',
  orderNumber: 7,
  status: 'out_for_delivery',
  finalPrice: 100000,
  itemCount: 1,
  pharmacy: WarehouseOrderPharmacy(id: 'p1', nameAr: 'صيدلية', nameEn: 'Pharmacy'),
);

void main() {
  late MockWarehouseOrdersCubit cubit;
  late MockManagementRepository repository;

  setUp(() {
    cubit = MockWarehouseOrdersCubit();
    repository = MockManagementRepository();
    when(() => cubit.load()).thenAnswer((_) async {});
    when(() => cubit.loadMore()).thenAnswer((_) async {});
    when(() => cubit.advance('o1')).thenAnswer((_) async => true);
    when(
      () => repository.recordPayment(
        pharmacyId: any(named: 'pharmacyId'),
        amountSyp: any(named: 'amountSyp'),
        method: any(named: 'method'),
        idempotencyKey: any(named: 'idempotencyKey'),
        note: any(named: 'note'),
      ),
    ).thenAnswer((_) async {});
  });

  Future<void> openSheet(WidgetTester tester) async {
    whenListen(
      cubit,
      const Stream<WarehouseOrdersState>.empty(),
      initialState: const WarehouseOrdersState(status: RepLoadStatus.loaded, orders: [_order]),
    );
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: RepositoryProvider<WarehouseManagementRepository>.value(
            value: repository,
            child: BlocProvider<WarehouseOrdersCubit>.value(value: cubit, child: const WarehouseOrdersTab()),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Mark as delivered'));
    await tester.pumpAndSettle();
    expect(find.text('Delivering order #7 - did you collect?'), findsOneWidget);
  }

  double? paid() {
    final calls = verify(
      () => repository.recordPayment(
        pharmacyId: 'p1',
        amountSyp: captureAny(named: 'amountSyp'),
        method: 'cash',
        idempotencyKey: any(named: 'idempotencyKey'),
        note: any(named: 'note'),
      ),
    );
    return calls.captured.single as double;
  }

  testWidgets('"All of it" delivers and records the whole amount', (tester) async {
    await openSheet(tester);
    await tester.tap(find.text('All of it'));
    await tester.pumpAndSettle();
    verify(() => cubit.advance('o1')).called(1);
    expect(paid(), 100000);
  });

  testWidgets('"Part" takes an amount (Arabic digits too) and shows what is left', (tester) async {
    await openSheet(tester);
    await tester.tap(find.text('Part'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '٦٠٠٠٠');
    await tester.pump();
    expect(find.textContaining('Left: 40,000'), findsOneWidget);
    await tester.tap(find.text('Deliver and save'));
    await tester.pumpAndSettle();
    verify(() => cubit.advance('o1')).called(1);
    expect(paid(), 60000);
  });

  testWidgets('"Later" delivers with nothing recorded', (tester) async {
    await openSheet(tester);
    await tester.tap(find.text('Later'));
    await tester.pumpAndSettle();
    verify(() => cubit.advance('o1')).called(1);
    verifyNever(
      () => repository.recordPayment(
        pharmacyId: any(named: 'pharmacyId'),
        amountSyp: any(named: 'amountSyp'),
        method: any(named: 'method'),
        idempotencyKey: any(named: 'idempotencyKey'),
        note: any(named: 'note'),
      ),
    );
  });

  testWidgets('closing the sheet delivers nothing', (tester) async {
    await openSheet(tester);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    verifyNever(() => cubit.advance(any()));
  });
}
