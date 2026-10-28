import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_summary_cubit.dart';
import 'package:feniq/features/warehouse/presentation/widgets/warehouse_summary_card.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockRepo extends Mock implements WarehouseManagementRepository {}

const _json = {
  'summary': {
    'period': {'kind': 'today'},
    'current': {'salesSyp': 150000, 'collectionsSyp': 90000, 'returnsSyp': 5000, 'invoiceCount': 3, 'paymentCount': 2},
    'previous': {'salesSyp': 100000, 'collectionsSyp': 0, 'returnsSyp': 0, 'invoiceCount': 2, 'paymentCount': 0},
    'topBuyers': [
      {
        'pharmacy': {'id': 'p1', 'nameAr': 'صيدلية الشفاء', 'nameEn': 'Al Shifa'},
        'salesSyp': 100000,
      },
      {
        'pharmacy': {'id': 'p2', 'nameAr': 'صيدلية النور', 'nameEn': 'Al Nour'},
        'salesSyp': 50000,
      },
    ],
    'outstanding': {
      'totalDebtSyp': 70000,
      'totalCreditSyp': 8000,
      'debtorCount': 2,
      'topDebtors': [
        {
          'pharmacy': {'id': 'p1', 'nameAr': 'صيدلية الشفاء', 'nameEn': 'Al Shifa'},
          'balanceSyp': 50000,
        },
      ],
    },
  },
};

WarehouseSummary _summary() => WarehouseSummary.fromJson(_json);

void main() {
  late MockRepo repo;

  setUp(() => repo = MockRepo());

  group('models', () {
    test('the summary reads both periods, the rankings and the debts', () {
      final summary = _summary();
      expect(summary.current.salesSyp, 150000);
      expect(summary.current.invoiceCount, 3);
      expect(summary.previous.salesSyp, 100000);
      expect(summary.topBuyers.map((r) => r.pharmacyId), ['p1', 'p2']);
      expect(summary.topBuyers.first.amountSyp, 100000);
      expect(summary.outstanding.totalDebtSyp, 70000);
      expect(summary.outstanding.totalCreditSyp, 8000);
      expect(summary.outstanding.topDebtors.single.amountSyp, 50000);
      expect(summary.outstanding.topDebtors.single.nameAr, 'صيدلية الشفاء');
    });

    test('a missing or empty summary reads as zeros, not a crash', () {
      final summary = WarehouseSummary.fromJson(const {});
      expect(summary.current.salesSyp, 0);
      expect(summary.topBuyers, isEmpty);
      expect(summary.outstanding.debtorCount, 0);
    });

    test('percent change is null with nothing to compare, rounded otherwise', () {
      expect(summaryPercentChange(500, 0), isNull);
      expect(summaryPercentChange(150, 100), 50);
      expect(summaryPercentChange(50, 100), -50);
      expect(summaryPercentChange(100, 100), 0);
      expect(summaryPercentChange(100, 300), -67);
    });

    test('a previous period that netted below zero has nothing to compare', () {
      // A rise from -50 to 100 must not be shown as a fall.
      expect(summaryPercentChange(100, -50), isNull);
      expect(summaryPercentChange(3e12, 1e12), 200);
    });
  });

  group('WarehouseSummaryCubit', () {
    test('load asks for the current period and keeps the answer', () async {
      when(() => repo.getSummary(period: any(named: 'period'))).thenAnswer((_) async => _summary());
      final cubit = WarehouseSummaryCubit(repository: repo);
      await cubit.load();
      expect(cubit.state.status, RepLoadStatus.loaded);
      expect(cubit.state.summary?.current.salesSyp, 150000);
      verify(() => repo.getSummary(period: 'today')).called(1);
      await cubit.close();
    });

    test('picking another period clears figures belonging to the previous period', () async {
      when(() => repo.getSummary(period: any(named: 'period'))).thenAnswer((_) async => _summary());
      final cubit = WarehouseSummaryCubit(repository: repo);
      await cubit.load();
      final states = <WarehouseSummaryState>[];
      final sub = cubit.stream.listen(states.add);
      await cubit.setPeriod('month');
      await Future<void>.delayed(Duration.zero);
      expect(cubit.state.period, 'month');
      expect(cubit.state.status, RepLoadStatus.loaded);
      expect(states.first.status, RepLoadStatus.loading);
      expect(states.first.summary, isNull);
      verify(() => repo.getSummary(period: 'month')).called(1);
      await sub.cancel();
      await cubit.close();
    });

    test('picking the period already shown does not fetch again', () async {
      when(() => repo.getSummary(period: any(named: 'period'))).thenAnswer((_) async => _summary());
      final cubit = WarehouseSummaryCubit(repository: repo);
      await cubit.load();
      await cubit.setPeriod('today');
      verify(() => repo.getSummary(period: 'today')).called(1);
      await cubit.close();
    });

    test('a failure is reported but earlier figures stay on screen', () async {
      when(() => repo.getSummary(period: any(named: 'period'))).thenAnswer((_) async => _summary());
      final cubit = WarehouseSummaryCubit(repository: repo);
      await cubit.load();
      when(() => repo.getSummary(period: any(named: 'period'))).thenThrow(ServerFailure('boom', code: 'HTTP_500'));
      await cubit.load();
      expect(cubit.state.status, RepLoadStatus.error);
      expect(cubit.state.errorCode, 'HTTP_500');
      expect(cubit.state.summary, isNotNull);
      await cubit.close();
    });

    test('a slow answer for an old period never overwrites a newer one', () async {
      final slow = Completer<WarehouseSummary>();
      when(() => repo.getSummary(period: 'today')).thenAnswer((_) => slow.future);
      when(
        () => repo.getSummary(period: 'week'),
      ).thenAnswer((_) async => const WarehouseSummary(current: SummaryTotals(salesSyp: 777)));
      final cubit = WarehouseSummaryCubit(repository: repo);
      final first = cubit.load();
      await cubit.setPeriod('week');
      slow.complete(_summary());
      await first;
      expect(cubit.state.period, 'week');
      expect(cubit.state.summary?.current.salesSyp, 777);
      await cubit.close();
    });
  });

  group('SummaryFigures', () {
    Future<void> pump(WidgetTester tester, Locale locale) => tester.pumpWidget(
      MaterialApp(
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: SingleChildScrollView(child: SummaryFigures(summary: _summary())),
        ),
      ),
    );

    testWidgets('shows the figures, the change and both rankings in Arabic', (tester) async {
      await pump(tester, const Locale('ar'));
      expect(find.textContaining('150'), findsWidgets);
      expect(find.textContaining('50%'), findsWidgets);
      expect(find.text('صيدلية الشفاء'), findsNWidgets(2));
      expect(find.text('صيدلية النور'), findsOneWidget);
    });

    testWidgets('uses the English names in English', (tester) async {
      await pump(tester, const Locale('en'));
      expect(find.text('Al Shifa'), findsNWidgets(2));
      expect(find.text('Al Nour'), findsOneWidget);
    });

    testWidgets('a previous period that netted below zero is not called empty', (tester) async {
      // Yesterday: -40,000 net sales (a reversal of an older charge); today: 150,000.
      final json = {
        ..._json['summary']!,
        'previous': {
          'salesSyp': -40000,
          'collectionsSyp': 90000,
          'returnsSyp': 0,
          'invoiceCount': 1,
          'paymentCount': 2,
        },
      };
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: SingleChildScrollView(child: SummaryFigures(summary: WarehouseSummary.fromJson({'summary': json}))),
          ),
        ),
      );
      final l10n = AppLocalizations.of(tester.element(find.byType(SummaryFigures)))!;
      expect(find.text(l10n.warehouseSummaryChangeNew), findsNothing);
      // Collections are flat (90,000 both times), so that line still shows.
      expect(find.text(l10n.warehouseSummaryChangeFlat), findsOneWidget);
    });

    testWidgets('an empty summary says there is nobody to list', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const Scaffold(
            body: SingleChildScrollView(child: SummaryFigures(summary: WarehouseSummary())),
          ),
        ),
      );
      final l10n = AppLocalizations.of(tester.element(find.byType(SummaryFigures)))!;
      expect(find.text(l10n.warehouseSummaryNoBuyers), findsOneWidget);
      expect(find.text(l10n.warehouseSummaryNoDebtors), findsOneWidget);
    });
  });
}
