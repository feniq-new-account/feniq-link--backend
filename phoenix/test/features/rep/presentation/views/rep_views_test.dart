import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';
import 'package:feniq/features/rep/presentation/managers/rep_home_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacies_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_visits_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/visit_code_cubit.dart';
import 'package:feniq/features/rep/presentation/utils/rep_labels.dart';
import 'package:feniq/features/rep/presentation/views/pharmacy_visit_code_view.dart';
import 'package:feniq/features/rep/presentation/views/rep_pharmacies_tab.dart';
import 'package:feniq/features/rep/presentation/views/rep_visits_tab.dart';
import 'package:feniq/features/rep/presentation/widgets/rep_pharmacy_card.dart';
import 'package:feniq/features/rep/presentation/widgets/rep_visit_tile.dart';
import 'package:feniq/generated/app_localizations.dart';

class MockRepRepository extends Mock implements RepRepository {}

class MockRepHomeCubit extends MockCubit<RepHomeState> implements RepHomeCubit {}

class MockRepPharmaciesCubit extends MockCubit<RepPharmaciesState> implements RepPharmaciesCubit {}

class MockRepVisitsCubit extends MockCubit<RepVisitsState> implements RepVisitsCubit {}

class MockVisitCodeCubit extends MockCubit<VisitCodeState> implements VisitCodeCubit {}

Widget _app(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  locale: locale,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: Scaffold(body: child),
);

final _now = DateTime(2026, 10, 7, 9);

RepPharmacy _pharmacy({String id = 'p1', DateTime? lastVisit, int orders = 0, String? city = 'Latakia'}) => RepPharmacy(
  id: id,
  nameAr: 'صيدلية الياسمين',
  nameEn: 'Al-Yasmin Pharmacy',
  city: city,
  address: 'Main street',
  hasLocation: true,
  activity: RepPharmacyActivity(lastVisitAt: lastVisit, monthOrdersCount: orders),
);

void main() {
  group('lastVisitText', () {
    late AppLocalizations l10n;

    setUp(() async => l10n = await AppLocalizations.delegate.load(const Locale('en')));

    test('never, today, yesterday, and N days ago - by calendar day', () {
      expect(lastVisitText(l10n, null, _now), 'Never visited');
      expect(lastVisitText(l10n, DateTime(2026, 10, 7, 1), _now), 'Last visit: today');
      // 11 pm yesterday read at 9 am is "yesterday", though only 10 hours ago.
      expect(lastVisitText(l10n, DateTime(2026, 10, 6, 23), _now), 'Last visit: yesterday');
      expect(lastVisitText(l10n, DateTime(2026, 10, 4, 12), _now), 'Last visit: 3 days ago');
    });

    test('the Arabic plural forms', () async {
      final ar = await AppLocalizations.delegate.load(const Locale('ar'));
      expect(lastVisitText(ar, DateTime(2026, 10, 5), _now), 'آخر زيارة: منذ يومين');
      expect(lastVisitText(ar, DateTime(2026, 10, 3), _now), 'آخر زيارة: منذ 4 أيام');
      expect(lastVisitText(ar, DateTime(2026, 9, 20), _now), 'آخر زيارة: منذ 17 يوماً');
    });
  });

  group('RepPharmacyCard', () {
    testWidgets('shows the name, the place, the last visit and the month\'s orders', (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        _app(
          RepPharmacyCard(
            pharmacy: _pharmacy(lastVisit: DateTime(2026, 10, 5, 10), orders: 7),
            now: _now,
            onTap: () => tapped = true,
          ),
        ),
      );

      expect(find.text('Al-Yasmin Pharmacy'), findsOneWidget);
      expect(find.text('Latakia · Main street'), findsOneWidget);
      expect(find.text('Last visit: 2 days ago'), findsOneWidget);
      expect(find.text('7 orders this month'), findsOneWidget);

      await tester.tap(find.byType(RepPharmacyCard));
      expect(tapped, isTrue);
    });

    testWidgets('a pharmacy never visited says so', (tester) async {
      await tester.pumpWidget(_app(RepPharmacyCard(pharmacy: _pharmacy(), now: _now, onTap: () {})));
      expect(find.text('Never visited'), findsOneWidget);
      expect(find.text('No orders this month'), findsOneWidget);
    });

    testWidgets('names follow the app language', (tester) async {
      await tester.pumpWidget(
        _app(RepPharmacyCard(pharmacy: _pharmacy(), now: _now, onTap: () {}), locale: const Locale('ar')),
      );
      expect(find.text('صيدلية الياسمين'), findsOneWidget);
    });
  });

  group('RepVisitTile', () {
    testWidgets('a verified visit and an out-of-range one read differently', (tester) async {
      await tester.pumpWidget(
        _app(
          Column(
            children: [
              RepVisitTile(
                visit: RepVisit(
                  id: 'v1',
                  status: VisitStatus.verified,
                  scannedAt: DateTime(2026, 10, 6, 15),
                  distanceMeters: 12,
                  pharmacyNameAr: 'صيدلية الفجر',
                  pharmacyNameEn: 'Al-Fajr Pharmacy',
                ),
              ),
              RepVisitTile(
                visit: RepVisit(
                  id: 'v2',
                  status: VisitStatus.outOfRange,
                  scannedAt: DateTime(2026, 10, 6, 16),
                  distanceMeters: 480,
                  pharmacyNameAr: 'صيدلية الندى',
                  pharmacyNameEn: 'Al-Nada Pharmacy',
                ),
              ),
            ],
          ),
        ),
      );

      expect(find.text('Verified'), findsOneWidget);
      expect(find.text('Out of range'), findsOneWidget);
      expect(find.text('12 m away'), findsOneWidget);
      expect(find.text('480 m away'), findsOneWidget);
      expect(find.text('Al-Fajr Pharmacy'), findsOneWidget);
    });
  });

  group('RepPharmaciesTab', () {
    late MockRepPharmaciesCubit pharmacies;
    late MockRepHomeCubit home;

    setUp(() {
      pharmacies = MockRepPharmaciesCubit();
      home = MockRepHomeCubit();
      when(() => home.state).thenReturn(
        const RepHomeState(
          status: RepLoadStatus.loaded,
          me: RepMe(
            name: 'أحمد',
            phone: '+963940000201',
            warehouse: null,
            stats: RepStats(pharmacyCount: 3, visitsLast7Days: 2, monthOrdersCount: 21),
          ),
        ),
      );
    });

    Future<void> pump(WidgetTester tester, RepPharmaciesState state) async {
      when(() => pharmacies.state).thenReturn(state);
      when(() => pharmacies.load(search: any(named: 'search'))).thenAnswer((_) async {});
      await tester.pumpWidget(
        _app(
          MultiBlocProvider(
            providers: [
              BlocProvider<RepPharmaciesCubit>.value(value: pharmacies),
              BlocProvider<RepHomeCubit>.value(value: home),
            ],
            child: const RepPharmaciesTab(),
          ),
        ),
      );
    }

    testWidgets('shows the numbers and the pharmacies', (tester) async {
      await pump(
        tester,
        RepPharmaciesState(status: RepLoadStatus.loaded, pharmacies: [_pharmacy(), _pharmacy(id: 'p2')]),
      );

      expect(find.text('Pharmacies'), findsOneWidget);
      expect(find.text('21'), findsOneWidget);
      expect(find.byType(RepPharmacyCard), findsNWidgets(2));
    });

    testWidgets('nothing assigned yet explains where the pharmacies come from', (tester) async {
      await pump(tester, const RepPharmaciesState(status: RepLoadStatus.loaded));

      expect(find.text('No pharmacies assigned to you yet'), findsOneWidget);
      expect(find.textContaining('The warehouse assigns your pharmacies'), findsOneWidget);
    });

    testWidgets('an empty search result is not mistaken for "none assigned"', (tester) async {
      await pump(tester, const RepPharmaciesState(status: RepLoadStatus.loaded, query: 'zzz'));

      expect(find.text('No pharmacy matches your search'), findsOneWidget);
      expect(find.text('No pharmacies assigned to you yet'), findsNothing);
    });

    testWidgets('a failed first load shows the translated error with a retry', (tester) async {
      await pump(
        tester,
        const RepPharmaciesState(status: RepLoadStatus.error, errorCode: 'REP_INACTIVE', errorMessage: 'off'),
      );

      expect(find.text('Your rep account has been switched off by the warehouse.'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      verify(() => pharmacies.load()).called(1);
    });

    testWidgets('typing in the search box asks for that search after a short pause', (tester) async {
      await pump(tester, RepPharmaciesState(status: RepLoadStatus.loaded, pharmacies: [_pharmacy()]));

      await tester.enterText(find.byType(TextField), 'yas');
      await tester.pump(const Duration(milliseconds: 400));

      verify(() => pharmacies.load(search: 'yas')).called(1);
    });
  });

  group('RepVisitsTab', () {
    late MockRepVisitsCubit visits;

    setUp(() => visits = MockRepVisitsCubit());

    Future<void> pump(WidgetTester tester, RepVisitsState state) async {
      when(() => visits.state).thenReturn(state);
      when(() => visits.load()).thenAnswer((_) async {});
      when(() => visits.loadMore()).thenAnswer((_) async {});
      await tester.pumpWidget(
        _app(BlocProvider<RepVisitsCubit>.value(value: visits, child: const RepVisitsTab())),
      );
    }

    testWidgets('no visits yet says how to log one', (tester) async {
      await pump(tester, const RepVisitsState(status: RepLoadStatus.loaded));

      expect(find.text('No visits logged yet'), findsOneWidget);
      expect(find.text('Scan the QR code at a pharmacy to log your visit.'), findsOneWidget);
    });

    testWidgets('lists the visits', (tester) async {
      await pump(
        tester,
        RepVisitsState(
          status: RepLoadStatus.loaded,
          visits: [
            RepVisit(
              id: 'v1',
              status: VisitStatus.verified,
              scannedAt: DateTime(2026, 10, 6, 15),
              pharmacyNameAr: 'صيدلية الفجر',
              pharmacyNameEn: 'Al-Fajr Pharmacy',
            ),
          ],
        ),
      );

      expect(find.byType(RepVisitTile), findsOneWidget);
      expect(find.text('Verified'), findsOneWidget);
    });
  });

  group('PharmacyVisitCodeView', () {
    late MockVisitCodeCubit cubit;

    setUp(() => cubit = MockVisitCodeCubit());

    Future<void> pump(WidgetTester tester, VisitCodeState state) async {
      when(() => cubit.state).thenReturn(state);
      when(() => cubit.load()).thenAnswer((_) async {});
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          locale: const Locale('en'),
          home: BlocProvider<VisitCodeCubit>.value(value: cubit, child: const PharmacyVisitCodeView()),
        ),
      );
    }

    testWidgets('shows the QR carrying the Feniq prefix, and the code to read out', (tester) async {
      await pump(
        tester,
        const VisitCodeState(
          status: RepLoadStatus.loaded,
          code: VisitCode(code: 'ABCDEFGHJKMNPQRS', qrPayload: 'FENIQ-VISIT:ABCDEFGHJKMNPQRS'),
        ),
      );

      expect(find.byType(QrImageView), findsOneWidget);
      expect(find.byKey(const ValueKey('FENIQ-VISIT:ABCDEFGHJKMNPQRS')), findsOneWidget);
      expect(find.textContaining('ABCDEFGHJKMNPQRS'), findsOneWidget);
      expect(find.textContaining('Show this code to the warehouse rep'), findsOneWidget);
    });

    testWidgets('while loading there is a spinner', (tester) async {
      await pump(tester, const VisitCodeState(status: RepLoadStatus.loading));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('a failed load shows the error with a retry', (tester) async {
      await pump(
        tester,
        const VisitCodeState(status: RepLoadStatus.error, errorCode: 'NETWORK_ERROR', errorMessage: 'x'),
      );

      expect(find.text('Retry'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      verify(() => cubit.load()).called(1);
    });
  });
}
