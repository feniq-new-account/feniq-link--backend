import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';
import 'package:feniq/features/rep/presentation/managers/rep_visits_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/visit_scan_cubit.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_summary_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_rep_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/widgets/warehouse_summary_card.dart';

class RepRepo extends Mock implements RepRepository {}

class WarehouseRepo extends Mock implements WarehouseManagementRepository {}

class Location extends Mock implements LocationProvider {}

RepVisit visit(String id) => RepVisit(id: id, status: VisitStatus.verified, scannedAt: DateTime(2026, 10, 28));

void main() {
  test('leaving during GPS lookup cancels safely before sending a visit', () async {
    final location = Location();
    final position = Completer<DeviceLocation>();
    when(location.current).thenAnswer((_) => position.future);
    final cubit = VisitScanCubit(repository: RepRepo(), locationProvider: location);
    final operation = cubit.onCodeDetected('FENIQ-VISIT:ABCDEFGHJKMNPQRS');
    expect(cubit.state.status, VisitScanStatus.locating);
    await cubit.close();
    final failure = expectLater(operation, completes);
    position.complete(const DeviceLocation(latitude: 35, longitude: 36, accuracy: 10, isMocked: false));
    await failure;
  });

  test('refresh invalidates in-flight pagination and preserves the new cursor', () async {
    final repo = RepRepo();
    final oldNext = Completer<RepVisitsPage>();
    var heads = 0;
    when(() => repo.getVisits()).thenAnswer(
      (_) async => ++heads == 1
          ? RepVisitsPage(visits: [visit('v10')], hasMore: true, nextCursor: 'v10')
          : RepVisitsPage(visits: [visit('v11')], hasMore: true, nextCursor: 'v11'),
    );
    when(() => repo.getVisits(after: 'v10')).thenAnswer((_) => oldNext.future);
    final cubit = RepVisitsCubit(repository: repo);
    await cubit.load();
    final pending = cubit.loadMore();
    await cubit.load();
    oldNext.complete(RepVisitsPage(visits: [visit('v9')], hasMore: true, nextCursor: 'v9'));
    await pending;
    expect(cubit.state.visits.map((v) => v.id), ['v11']);
    expect(cubit.state.nextCursor, 'v11');
    await cubit.close();
  });

  test('closing during a visit request safely ignores its late receipt', () async {
    final repo = RepRepo();
    final location = Location();
    final response = Completer<RecordedVisit>();
    when(
      location.current,
    ).thenAnswer((_) async => const DeviceLocation(latitude: 35, longitude: 36, accuracy: 10, isMocked: false));
    when(
      () => repo.recordVisit(
        code: any(named: 'code'),
        latitude: any(named: 'latitude'),
        longitude: any(named: 'longitude'),
        accuracy: any(named: 'accuracy'),
        isMocked: any(named: 'isMocked'),
      ),
    ).thenAnswer((_) => response.future);
    final cubit = VisitScanCubit(repository: repo, locationProvider: location);
    final pending = cubit.onCodeDetected('FENIQ-VISIT:ABCDEFGHJKMNPQRS');
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.status, VisitScanStatus.submitting);
    cubit.scanAgain();
    expect(cubit.state.status, VisitScanStatus.submitting);
    await cubit.close();
    response.complete(
      RecordedVisit(visit: visit('saved'), pharmacyNameAr: 'صيدلية', pharmacyNameEn: 'Pharmacy', duplicate: false),
    );
    await expectLater(pending, completes);
  });

  test('manager refresh discards the old visits page and exposes pagination errors for retry', () async {
    final repo = WarehouseRepo();
    final oldPage = Completer<WarehouseRepVisitsPage>();
    var heads = 0;
    WarehouseRepVisit entry(String id) => WarehouseRepVisit(id: id, status: 'verified');
    when(() => repo.getRepPharmacies('r1')).thenAnswer((_) async => []);
    when(() => repo.getRepVisits(repId: 'r1')).thenAnswer(
      (_) async => ++heads == 1
          ? WarehouseRepVisitsPage(visits: [entry('v10')], hasMore: true, nextCursor: 'v10')
          : WarehouseRepVisitsPage(visits: [entry('v11')], hasMore: true, nextCursor: 'v11'),
    );
    when(() => repo.getRepVisits(repId: 'r1', after: 'v10')).thenAnswer((_) => oldPage.future);
    when(() => repo.getRepVisits(repId: 'r1', after: 'v11')).thenThrow(ServerFailure('offline', code: 'NETWORK_ERROR'));
    final cubit = WarehouseRepDetailCubit(repository: repo, repId: 'r1');
    await cubit.load();
    final pending = cubit.loadMoreVisits();
    await cubit.load();
    oldPage.complete(WarehouseRepVisitsPage(visits: [entry('v9')], hasMore: true, nextCursor: 'v9'));
    await pending;
    expect(cubit.state.visits.map((v) => v.id), ['v11']);
    expect(cubit.state.nextCursor, 'v11');
    await cubit.loadMoreVisits();
    expect(cubit.state.loadMoreError, isTrue);
    expect(cubit.state.errorCode, 'NETWORK_ERROR');
    when(
      () => repo.getRepVisits(repId: 'r1', after: 'v11'),
    ).thenAnswer((_) async => WarehouseRepVisitsPage(visits: [entry('v10'), entry('v10')]));
    await cubit.loadMoreVisits();
    expect(cubit.state.visits.map((v) => v.id), ['v11', 'v10']);
    expect(cubit.state.loadMoreError, isFalse);
    await cubit.close();
  });

  testWidgets('failed month switch shows an error without displaying today as month', (tester) async {
    final repo = WarehouseRepo();
    const today = WarehouseSummary(current: SummaryTotals(salesSyp: 500000));
    when(() => repo.getSummary(period: 'today')).thenAnswer((_) async => today);
    when(() => repo.getSummary(period: 'month')).thenThrow(ServerFailure('offline', code: 'NETWORK_ERROR'));
    final cubit = WarehouseSummaryCubit(repository: repo);
    await cubit.load();
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: SingleChildScrollView(
            child: BlocProvider.value(value: cubit, child: const WarehouseSummaryCard()),
          ),
        ),
      ),
    );
    await cubit.setPeriod('month');
    await tester.pumpAndSettle();
    expect(cubit.state.period, 'month');
    expect(cubit.state.errorCode, 'NETWORK_ERROR');
    expect(tester.widget<ChoiceChip>(find.byType(ChoiceChip).at(2)).selected, isTrue);
    expect(find.byType(SummaryFigures), findsNothing);
    expect(find.byType(FailureWidget), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await cubit.close();
  });
}
