import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_loyalty_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_reps_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_loyalty_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockRepo extends Mock implements WarehouseManagementRepository {}

class MockLoyalty extends MockCubit<WarehouseLoyaltyState> implements WarehouseLoyaltyCubit {}

void main() {
  late MockRepo repo;

  setUp(() => repo = MockRepo());

  test('monthly strategy survives reading and saving the server settings', () async {
    final monthly = WarehouseLoyalty.fromSettingsJson({
      'settings': {
        'loyalty': {
          'mode': 'monthly',
          'enabled': true,
          'tiers': [
            {'minSyp': 100000, 'discountSyp': 1000},
          ],
        },
      },
    });
    when(
      () => repo.updateLoyalty(enabled: true, tiers: monthly.tiers, mode: 'monthly', revision: 0),
    ).thenAnswer((_) async => monthly);
    final cubit = WarehouseLoyaltyCubit(repository: repo);
    expect(await cubit.save(enabled: true, tiers: monthly.tiers, mode: 'monthly'), isTrue);
    expect(cubit.state.loyalty.mode, 'monthly');
    await cubit.close();
  });

  test('the quarters and the loyalty lines read off an order', () {
    final order = WarehouseOrderDetail.fromJson({
      'order': {
        'id': 'o1',
        'orderNumber': 3,
        'status': 'pending',
        'loyaltyDiscountAmount': 2000,
        'creditUsedSyp': 500,
        'repCommission': {
          'rate': 2,
          'repAmount': 1000,
          'feniqAmount': 500,
          'pharmacyAmount': 500,
          'savingAmount': 0,
          'warehouseShareToRep': true,
        },
      },
    });
    expect(order.loyaltyDiscountAmount, 2000);
    expect(order.creditUsedSyp, 500);
    expect(order.repCommission?.pharmacyAmount, 500);
    expect(order.repCommission?.warehouseShareToRep, isTrue);
  });

  test('loyalty settings read from the settings response', () {
    final loyalty = WarehouseLoyalty.fromSettingsJson({
      'settings': {
        'loyalty': {
          'enabled': true,
          'tiers': [
            {'minSyp': 100000, 'discountSyp': 2000},
          ],
        },
      },
    });
    expect(loyalty.enabled, isTrue);
    expect(loyalty.tiers.single.discountSyp, 2000);
  });

  test('amounts typed with grouping or Arabic-Indic digits are read', () {
    expect(parseWholeLiras('100,000'), 100000);
    expect(parseWholeLiras('١٠٠٠٠٠'), 100000);
    expect(parseWholeLiras('٢،٠٠٠'), 2000);
    expect(parseWholeLiras('abc'), isNull);
  });

  test('saving the loyalty discount keeps what the server answers; a refusal says why', () async {
    const tiers = [LoyaltyTier(minSyp: 100000, discountSyp: 2000)];
    when(
      () => repo.updateLoyalty(enabled: true, tiers: tiers, mode: 'per_order', revision: 0),
    ).thenAnswer((_) async => const WarehouseLoyalty(enabled: true, tiers: tiers));
    final cubit = WarehouseLoyaltyCubit(repository: repo);
    expect(await cubit.save(enabled: true, tiers: tiers), isTrue);
    expect(cubit.state.loyalty.enabled, isTrue);

    when(
      () => repo.updateLoyalty(enabled: true, tiers: const [], mode: 'per_order', revision: 0),
    ).thenThrow(ServerFailure('no', code: 'LOYALTY_TIERS_REQUIRED'));
    expect(await cubit.save(enabled: true, tiers: const []), isFalse);
    expect(cubit.state.actionErrorCode, 'LOYALTY_TIERS_REQUIRED');
  });

  test('giving the warehouse quarter to a rep keeps the row numbers', () async {
    const rep = WarehouseRep(id: 'r1', name: 'Ahmad', phone: '0940000201', commissionRate: 2, pharmacyCount: 4);
    when(() => repo.getReps()).thenAnswer((_) async => [rep]);
    when(() => repo.updateRep('r1', warehouseShareToRep: true)).thenAnswer(
      (_) async => const WarehouseRep(
        id: 'r1',
        name: 'Ahmad',
        phone: '0940000201',
        commissionRate: 2,
        warehouseShareToRep: true,
      ),
    );
    final cubit = WarehouseRepsCubit(repository: repo);
    await cubit.load();
    expect(await cubit.updateRep('r1', warehouseShareToRep: true), isTrue);
    expect(cubit.state.reps.single.warehouseShareToRep, isTrue);
    expect(cubit.state.reps.single.pharmacyCount, 4);
  });

  testWidgets('a tier whose discount is not below its order value is refused before saving', (tester) async {
    final cubit = MockLoyalty();
    whenListen(
      cubit,
      const Stream<WarehouseLoyaltyState>.empty(),
      initialState: const WarehouseLoyaltyState(status: RepLoadStatus.loaded),
    );
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: BlocProvider<WarehouseLoyaltyCubit>.value(value: cubit, child: const WarehouseLoyaltyView()),
      ),
    );
    await tester.pump();
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), '1000');
    await tester.enterText(fields.at(1), '5000');
    await tester.tap(find.text('Save the loyalty discount'));
    await tester.pump();
    expect(find.text('Each tier needs an order value above zero and a smaller discount.'), findsOneWidget);
    verifyNever(
      () => cubit.save(
        enabled: any(named: 'enabled'),
        tiers: any(named: 'tiers'),
      ),
    );
  });
}
