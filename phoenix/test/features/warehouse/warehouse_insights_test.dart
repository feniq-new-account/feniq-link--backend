import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/theme/dark_theme.dart';
import 'package:feniq/core/theme/light_theme.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_insights_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_insights_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_insights_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class Repo extends Mock implements WarehouseManagementRepository {}

class Insights extends MockCubit<WarehouseInsightsState>
    implements WarehouseInsightsCubit {}

const flags = {
  'ownerInsights': true,
  'salesReports': true,
  'overdueReceivables': true,
  'inactivePharmacies': true,
  'ownerAlerts': true,
};
const report = WarehouseInsightsReport(
  asOfBusiness: '2026-10-29 14:30',
  netSalesSyp: 128745600,
  collectionsSyp: 98245600,
  returnsSyp: 1245600,
  debtSyp: 190012000,
  unknownAgeSyp: 12000,
  aging: [90000000, 60000000, 30000000, 10000000],
  daily: [
    DailyWarehouseMovement(
      date: '2026-10-27',
      netSalesSyp: 48245600,
      collectionsSyp: 38245600,
    ),
    DailyWarehouseMovement(
      date: '2026-10-28',
      netSalesSyp: -1000000,
      collectionsSyp: 0,
    ),
    DailyWarehouseMovement(
      date: '2026-10-29',
      netSalesSyp: 81500000,
      collectionsSyp: 60000000,
    ),
  ],
);
const row = WarehouseFollowUpRow(
  pharmacyId: 'p1',
  nameAr: 'صيدلية الشفاء Al-Shifa (الفرع 2) - ريف اللاذقية',
  nameEn: 'Al-Shifa Pharmacy (Branch 2) - Latakia Countryside',
  city: 'اللاذقية',
  phone: '0944123456',
  days: 28,
  overdueSyp: 128745600,
);
void main() {
  test(
    'a slower failed month request cannot replace the selected day or its figures',
    () async {
      final repo = Repo(), month = Completer<WarehouseInsightsReport>();
      when(repo.getInsightAccess).thenAnswer((_) async => flags);
      when(
        () => repo.getInsights(period: 'month', force: true),
      ).thenAnswer((_) => month.future);
      when(
        () => repo.getInsights(period: 'today', force: false),
      ).thenAnswer((_) async => report);
      final cubit = WarehouseInsightsCubit(
        repository: repo,
        warehouseRole: 'owner',
      );
      final loading = cubit.loadAccess();
      await Future<void>.delayed(Duration.zero);
      await cubit.setPeriod('today');
      month.completeError(ServerFailure('month failed'));
      await loading;
      expect(cubit.state.period, 'today');
      expect(cubit.state.report, same(report));
      expect(cubit.state.status, RepLoadStatus.loaded);
      expect(cubit.state.errorMessage, isNull);
      await cubit.close();
    },
  );
  test(
    'refresh invalidates a pending next page without mixing its rows or cursor',
    () async {
      final repo = Repo(), next = Completer<WarehouseFollowUpPage>();
      when(
        repo.getInsightAccess,
      ).thenAnswer((_) async => {'overdueReceivables': true});
      var heads = 0;
      when(() => repo.getFollowUp(kind: 'overdue', force: true)).thenAnswer(
        (_) async => WarehouseFollowUpPage(
          rows: [
            WarehouseFollowUpRow(
              pharmacyId: ++heads == 1 ? 'old' : 'new',
              nameAr: 'صيدلية',
              nameEn: 'Pharmacy',
            ),
          ],
          hasMore: true,
          nextCursor: 'c$heads',
        ),
      );
      when(
        () => repo.getFollowUp(kind: 'overdue', after: 'c1', force: false),
      ).thenAnswer((_) => next.future);
      final cubit = WarehouseInsightsCubit(
        repository: repo,
        warehouseRole: 'owner',
      );
      await cubit.loadAccess();
      final pending = cubit.loadMore();
      await cubit.load(force: true);
      next.complete(const WarehouseFollowUpPage(rows: [row], hasMore: false));
      await pending;
      expect(cubit.state.followUp!.rows.single.pharmacyId, 'new');
      expect(cubit.state.followUp!.nextCursor, 'c2');
      expect(cubit.state.loadingMore, isFalse);
      await cubit.close();
    },
  );
  test('owner and accountant use their separate report entitlements', () async {
    final repo = Repo();
    when(repo.getInsightAccess).thenAnswer((_) async => {'salesReports': true});
    when(
      () => repo.getInsights(period: 'month', force: true),
    ).thenAnswer((_) async => report);
    final owner = WarehouseInsightsCubit(
      repository: repo,
      warehouseRole: 'owner',
    );
    await owner.loadAccess();
    expect(owner.state.tabs, isEmpty);
    final accountant = WarehouseInsightsCubit(
      repository: repo,
      warehouseRole: 'accountant',
    );
    await accountant.loadAccess();
    expect(accountant.state.tabs, ['overview']);
    await owner.close();
    await accountant.close();
  });
  group('real Arabic report layouts', () {
    setUpAll(() async {
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      for (final family in ['Readex', 'Plex']) {
        final loader = FontLoader(family);
        for (final weight in [400, 500, 600, 700]) {
          loader.addFont(
            rootBundle.load(
              'assets/fonts/${family == 'Readex' ? 'ReadexPro' : 'IBMPlexSansArabic'}-$weight.ttf',
            ),
          );
        }
        await loader.load();
      }
    });
    for (final size in [
      const Size(320, 640),
      const Size(390, 844),
      const Size(568, 320),
      const Size(768, 1024),
      const Size(1024, 768),
    ]) {
      for (final scale in [1.0, 2.0]) {
        for (final dark in [false, true]) {
          for (final tab in ['overview', 'overdue', 'inactive', 'alerts']) {
            testWidgets(
              '$tab ${size.width}x${size.height} text=$scale dark=$dark',
              (tester) async {
                tester.view.physicalSize = size;
                tester.view.devicePixelRatio = 1;
                addTearDown(tester.view.reset);
                final state = WarehouseInsightsState(
                  status: RepLoadStatus.loaded,
                  tabs: const ['overview', 'overdue', 'inactive', 'alerts'],
                  tab: tab,
                  report: tab == 'overview' ? report : null,
                  flags: flags,
                  followUp: ['overdue', 'inactive'].contains(tab)
                      ? const WarehouseFollowUpPage(
                          rows: [row],
                          total: 1,
                          asOfBusiness: '2026-10-29 14:30',
                        )
                      : null,
                  alerts: tab == 'alerts'
                      ? const [
                          WarehouseInsightAlert(
                            code: 'orders_pending',
                            count: 12,
                          ),
                          WarehouseInsightAlert(
                            code: 'overdue',
                            count: 24,
                            amountSyp: 128745600,
                          ),
                        ]
                      : const [],
                );
                final cubit = Insights();
                whenListen(
                  cubit,
                  Stream<WarehouseInsightsState>.empty(),
                  initialState: state,
                );
                final boundaryKey = GlobalKey();
                await tester.pumpWidget(
                  MaterialApp(
                    locale: const Locale('ar'),
                    theme: dark ? DarkTheme.data : LightTheme.data,
                    localizationsDelegates:
                        AppLocalizations.localizationsDelegates,
                    supportedLocales: AppLocalizations.supportedLocales,
                    home: MediaQuery(
                      data: MediaQueryData(
                        size: size,
                        textScaler: TextScaler.linear(scale),
                      ),
                      child: BlocProvider<WarehouseInsightsCubit>.value(
                        value: cubit,
                        child: RepaintBoundary(
                          key: boundaryKey,
                          child: const WarehouseInsightsView(),
                        ),
                      ),
                    ),
                  ),
                );
                await tester.pumpAndSettle();
                expect(tester.takeException(), isNull);
                if (tab == 'overview') {
                  await tester.scrollUntilVisible(
                    find.byType(Slider),
                    200,
                    scrollable: find.byType(Scrollable).first,
                  );
                  await tester.pumpAndSettle();
                  expect(tester.takeException(), isNull);
                  expect(find.text('2026-10-29'), findsWidgets);
                }
                final path = Platform.environment['FENIQ_CAPTURE_DIR'];
                if (path != null) {
                  await tester.runAsync(() async {
                    await Directory(path).create(recursive: true);
                    final boundary =
                        boundaryKey.currentContext!.findRenderObject()!
                            as RenderRepaintBoundary;
                    final picture = await boundary.toImage(pixelRatio: 1);
                    final bytes = await picture.toByteData(
                      format: ui.ImageByteFormat.png,
                    );
                    await File(
                      '$path/$tab-${size.width}-${size.height}-$scale-$dark.png',
                    ).writeAsBytes(bytes!.buffer.asUint8List());
                    picture.dispose();
                  });
                }
                expect(tester.takeException(), isNull);
              },
            );
          }
        }
      }
    }
  });
}
