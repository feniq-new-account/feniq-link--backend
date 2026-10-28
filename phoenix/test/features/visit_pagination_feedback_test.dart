import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/managers/rep_visits_cubit.dart';
import 'package:feniq/features/rep/presentation/views/rep_visits_tab.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_rep_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_rep_detail_view.dart';
import 'package:feniq/generated/app_localizations.dart';

class Visits extends MockCubit<RepVisitsState> implements RepVisitsCubit {}

class Detail extends MockCubit<WarehouseRepDetailState> implements WarehouseRepDetailCubit {}

void main() {
  for (final manager in [false, true]) {
    testWidgets('${manager ? 'manager' : 'rep'} can retry a failed page at the end of a long visit log', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(360, 640);
      tester.platformDispatcher.textScaleFactorTestValue = 1.6;
      addTearDown(() {
        tester.view.resetDevicePixelRatio();
        tester.view.resetPhysicalSize();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });
      final visits = Visits();
      final detail = Detail();
      when(visits.loadMore).thenAnswer((_) async {});
      when(detail.loadMoreVisits).thenAnswer((_) async {});
      whenListen(
        visits,
        const Stream<RepVisitsState>.empty(),
        initialState: RepVisitsState(
          status: RepLoadStatus.loaded,
          hasMore: true,
          nextCursor: 'v24',
          loadMoreError: true,
          errorCode: 'NETWORK_ERROR',
          visits: [
            for (var i = 0; i < 25; i++)
              RepVisit(
                id: 'v$i',
                status: VisitStatus.verified,
                pharmacyNameEn: 'Pharmacy $i',
                scannedAt: DateTime(2026, 10, 28),
              ),
          ],
        ),
      );
      whenListen(
        detail,
        const Stream<WarehouseRepDetailState>.empty(),
        initialState: WarehouseRepDetailState(
          status: RepLoadStatus.error,
          hasMoreVisits: true,
          nextCursor: 'v24',
          loadMoreError: true,
          errorCode: 'NETWORK_ERROR',
          visits: [
            for (var i = 0; i < 25; i++)
              WarehouseRepVisit(id: 'v$i', status: 'verified', pharmacyNameEn: 'Pharmacy $i'),
          ],
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: manager
              ? BlocProvider<WarehouseRepDetailCubit>.value(
                  value: detail,
                  child: const WarehouseRepDetailView(repName: 'Rep'),
                )
              : BlocProvider<RepVisitsCubit>.value(
                  value: visits,
                  child: const Scaffold(body: RepVisitsTab()),
                ),
        ),
      );
      await tester.pump();
      final scrollable = find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first;
      final position = tester.state<ScrollableState>(scrollable).position;
      for (var i = 0; i < 8; i++) {
        position.jumpTo(position.maxScrollExtent);
        await tester.pump();
      }
      final retry = find.descendant(
        of: find.byType(FailureWidget),
        matching: find.byWidgetPredicate((widget) => widget is OutlinedButton),
      );
      expect(
        retry.hitTestable(),
        findsOneWidget,
        reason: 'A page error must be visible where the user reached the end',
      );
      verifyNever(visits.loadMore);
      verifyNever(detail.loadMoreVisits);
      clearInteractions(visits);
      clearInteractions(detail);
      await tester.tap(retry);
      if (manager) {
        verify(detail.loadMoreVisits).called(1);
      } else {
        verify(visits.loadMore).called(1);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
