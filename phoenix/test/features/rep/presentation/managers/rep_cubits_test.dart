import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';
import 'package:feniq/features/rep/presentation/managers/rep_home_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacies_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacy_detail_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_visits_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/visit_code_cubit.dart';

class MockRepRepository extends Mock implements RepRepository {}

RepPharmacy _pharmacy(String id) => RepPharmacy(id: id, nameAr: 'صيدلية $id', nameEn: 'Pharmacy $id');

RepVisit _visit(String id) => RepVisit(id: id, status: VisitStatus.verified, scannedAt: DateTime(2026, 10, 6));

void main() {
  late MockRepRepository repository;

  setUp(() => repository = MockRepRepository());

  group('RepHomeCubit', () {
    test('loads the rep\'s profile and numbers', () async {
      const me = RepMe(name: 'أحمد', phone: '+963940000201', warehouse: null, stats: RepStats(pharmacyCount: 3));
      when(() => repository.getMe()).thenAnswer((_) async => me);
      final cubit = RepHomeCubit(repository: repository);

      await cubit.load();

      expect(cubit.state.status, RepLoadStatus.loaded);
      expect(cubit.state.me?.stats.pharmacyCount, 3);
    });

    test('a failure keeps what was already on screen', () async {
      const me = RepMe(name: 'أحمد', phone: '+963940000201', warehouse: null, stats: RepStats());
      when(() => repository.getMe()).thenAnswer((_) async => me);
      final cubit = RepHomeCubit(repository: repository);
      await cubit.load();

      when(() => repository.getMe()).thenThrow(ServerFailure('boom', code: 'HTTP_500'));
      await cubit.load();

      expect(cubit.state.status, RepLoadStatus.error);
      expect(cubit.state.errorCode, 'HTTP_500');
      expect(cubit.state.me?.name, 'أحمد');
    });
  });

  group('RepPharmaciesCubit', () {
    test('loads the list, and remembers the search it was loaded for', () async {
      when(() => repository.getPharmacies(search: any(named: 'search'))).thenAnswer((_) async => [_pharmacy('a')]);
      final cubit = RepPharmaciesCubit(repository: repository);

      await cubit.load(search: '  yas ');

      expect(cubit.state.status, RepLoadStatus.loaded);
      expect(cubit.state.query, 'yas');
      expect(cubit.state.pharmacies.single.id, 'a');
      verify(() => repository.getPharmacies(search: 'yas')).called(1);
    });

    test('only the newest search may write: a slow earlier answer is dropped', () async {
      final slow = Completer<List<RepPharmacy>>();
      when(() => repository.getPharmacies(search: 'y')).thenAnswer((_) => slow.future);
      when(() => repository.getPharmacies(search: 'yas')).thenAnswer((_) async => [_pharmacy('yasmin')]);
      final cubit = RepPharmaciesCubit(repository: repository);

      final first = cubit.load(search: 'y');
      await cubit.load(search: 'yas');
      slow.complete([_pharmacy('zaytoun')]);
      await first;

      expect(cubit.state.query, 'yas');
      expect(cubit.state.pharmacies.single.id, 'yasmin');
    });

    test('a failure with nothing loaded is an error state carrying the code', () async {
      when(() => repository.getPharmacies(search: any(named: 'search')))
          .thenThrow(ServerFailure('no network', code: 'NETWORK_ERROR'));
      final cubit = RepPharmaciesCubit(repository: repository);

      await cubit.load();

      expect(cubit.state.status, RepLoadStatus.error);
      expect(cubit.state.errorCode, 'NETWORK_ERROR');
      expect(cubit.state.pharmacies, isEmpty);
    });
  });

  group('RepPharmacyDetailCubit', () {
    test('loads the pharmacy it was made for', () async {
      final detail = RepPharmacyDetail(pharmacy: _pharmacy('p1'), orders: const [], visits: const []);
      when(() => repository.getPharmacy('p1')).thenAnswer((_) async => detail);
      final cubit = RepPharmacyDetailCubit(repository: repository, pharmacyId: 'p1');

      await cubit.load();

      expect(cubit.state.status, RepLoadStatus.loaded);
      expect(cubit.state.detail?.pharmacy.id, 'p1');
    });

    test('a pharmacy that is not the rep\'s is an error with the server\'s code', () async {
      when(() => repository.getPharmacy('p9'))
          .thenThrow(ServerFailure('not assigned', code: 'PHARMACY_NOT_ASSIGNED', statusCode: 403));
      final cubit = RepPharmacyDetailCubit(repository: repository, pharmacyId: 'p9');

      await cubit.load();

      expect(cubit.state.status, RepLoadStatus.error);
      expect(cubit.state.errorCode, 'PHARMACY_NOT_ASSIGNED');
      expect(cubit.state.detail, isNull);
    });
  });

  group('RepVisitsCubit', () {
    test('loads the first page, then appends the next one from its cursor', () async {
      when(() => repository.getVisits())
          .thenAnswer((_) async => RepVisitsPage(visits: [_visit('1'), _visit('2')], hasMore: true, nextCursor: 'c1'));
      when(() => repository.getVisits(after: 'c1'))
          .thenAnswer((_) async => RepVisitsPage(visits: [_visit('3')], hasMore: false));
      final cubit = RepVisitsCubit(repository: repository);

      await cubit.load();
      expect(cubit.state.visits.map((v) => v.id), ['1', '2']);
      expect(cubit.state.hasMore, isTrue);

      await cubit.loadMore();
      expect(cubit.state.visits.map((v) => v.id), ['1', '2', '3']);
      expect(cubit.state.hasMore, isFalse);
      expect(cubit.state.isLoadingMore, isFalse);
    });

    test('loadMore does nothing on the last page or while one is loading', () async {
      when(() => repository.getVisits()).thenAnswer((_) async => RepVisitsPage(visits: [_visit('1')], hasMore: false));
      final cubit = RepVisitsCubit(repository: repository);
      await cubit.load();

      await cubit.loadMore();

      // Only the first page was ever asked for.
      verify(() => repository.getVisits()).called(1);
      verifyNoMoreInteractions(repository);
    });

    test('a failed next page keeps the rows and leaves the cursor for a retry', () async {
      when(() => repository.getVisits())
          .thenAnswer((_) async => RepVisitsPage(visits: [_visit('1')], hasMore: true, nextCursor: 'c1'));
      when(() => repository.getVisits(after: 'c1')).thenThrow(ServerFailure('offline', code: 'NETWORK_ERROR'));
      final cubit = RepVisitsCubit(repository: repository);
      await cubit.load();

      await cubit.loadMore();

      expect(cubit.state.visits.map((v) => v.id), ['1']);
      expect(cubit.state.hasMore, isTrue);
      expect(cubit.state.nextCursor, 'c1');
      expect(cubit.state.isLoadingMore, isFalse);
    });
  });

  group('VisitCodeCubit', () {
    test('loads the pharmacy\'s own QR', () async {
      when(() => repository.getVisitCode())
          .thenAnswer((_) async => const VisitCode(code: 'ABCDEFGHJKMNPQRS', qrPayload: 'FENIQ-VISIT:ABCDEFGHJKMNPQRS'));
      final cubit = VisitCodeCubit(repository: repository);

      await cubit.load();

      expect(cubit.state.status, RepLoadStatus.loaded);
      expect(cubit.state.code?.qrPayload, 'FENIQ-VISIT:ABCDEFGHJKMNPQRS');
    });
  });
}
