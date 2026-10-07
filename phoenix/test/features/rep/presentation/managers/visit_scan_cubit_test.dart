import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/repositories/rep_repository.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';
import 'package:feniq/features/rep/presentation/managers/visit_scan_cubit.dart';

class MockRepRepository extends Mock implements RepRepository {}

class MockLocationProvider extends Mock implements LocationProvider {}

const _qr = 'FENIQ-VISIT:ABCDEFGHJKMNPQRS';

const _here = DeviceLocation(latitude: 35.5236, longitude: 35.7872, accuracy: 12, isMocked: false);

RecordedVisit _recorded(VisitStatus status, {int? distance, bool duplicate = false}) => RecordedVisit(
  visit: RepVisit(id: 'v1', status: status, scannedAt: DateTime(2026, 10, 6), distanceMeters: distance),
  pharmacyNameAr: 'صيدلية الياسمين',
  pharmacyNameEn: 'Al-Yasmin Pharmacy',
  duplicate: duplicate,
);

void main() {
  late MockRepRepository repository;
  late MockLocationProvider location;

  VisitScanCubit build() => VisitScanCubit(repository: repository, locationProvider: location);

  void stubRecord(Future<RecordedVisit> Function() answer) {
    when(
      () => repository.recordVisit(
        code: any(named: 'code'),
        latitude: any(named: 'latitude'),
        longitude: any(named: 'longitude'),
        accuracy: any(named: 'accuracy'),
        isMocked: any(named: 'isMocked'),
      ),
    ).thenAnswer((_) => answer());
  }

  setUp(() {
    repository = MockRepRepository();
    location = MockLocationProvider();
  });

  test('starts on the camera', () {
    final cubit = build();
    expect(cubit.state.status, VisitScanStatus.scanning);
    expect(cubit.state.notFeniqCode, isFalse);
  });

  blocTest<VisitScanCubit, VisitScanState>(
    'a QR that is not a Feniq visit code is flagged, and never sent anywhere',
    build: build,
    act: (cubit) async {
      await cubit.onCodeDetected('https://example.com');
      await cubit.onCodeDetected('https://example.com'); // the camera repeats it
    },
    expect: () => [
      isA<VisitScanState>()
          .having((s) => s.status, 'status', VisitScanStatus.scanning)
          .having((s) => s.notFeniqCode, 'notFeniqCode', isTrue),
    ],
    verify: (_) {
      verifyNever(() => location.current());
      verifyNever(
        () => repository.recordVisit(
          code: any(named: 'code'),
          latitude: any(named: 'latitude'),
          longitude: any(named: 'longitude'),
          accuracy: any(named: 'accuracy'),
          isMocked: any(named: 'isMocked'),
        ),
      );
    },
  );

  blocTest<VisitScanCubit, VisitScanState>(
    'a Feniq QR reads the position, sends both, and shows the verified visit',
    build: () {
      when(() => location.current()).thenAnswer((_) async => _here);
      stubRecord(() async => _recorded(VisitStatus.verified, distance: 9));
      return build();
    },
    act: (cubit) => cubit.onCodeDetected('  $_qr '),
    expect: () => [
      isA<VisitScanState>().having((s) => s.status, 'status', VisitScanStatus.locating),
      isA<VisitScanState>().having((s) => s.status, 'status', VisitScanStatus.submitting),
      isA<VisitScanState>()
          .having((s) => s.status, 'status', VisitScanStatus.done)
          .having((s) => s.result?.visit.status, 'visit status', VisitStatus.verified),
    ],
    verify: (_) {
      verify(
        () => repository.recordVisit(
          code: _qr,
          latitude: 35.5236,
          longitude: 35.7872,
          accuracy: 12,
          isMocked: false,
        ),
      ).called(1);
    },
  );

  blocTest<VisitScanCubit, VisitScanState>(
    'the phone\'s own "location is spoofed" flag is sent as it is',
    build: () {
      when(() => location.current()).thenAnswer(
        (_) async => const DeviceLocation(latitude: 1, longitude: 2, accuracy: 3, isMocked: true),
      );
      stubRecord(() async => _recorded(VisitStatus.mockLocation));
      return build();
    },
    act: (cubit) => cubit.onCodeDetected(_qr),
    verify: (cubit) {
      verify(
        () => repository.recordVisit(code: _qr, latitude: 1, longitude: 2, accuracy: 3, isMocked: true),
      ).called(1);
      expect(cubit.state.result?.visit.status, VisitStatus.mockLocation);
    },
  );

  blocTest<VisitScanCubit, VisitScanState>(
    'while a scan is being processed, more frames of the same QR do nothing',
    build: () {
      when(() => location.current()).thenAnswer((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 10));
        return _here;
      });
      stubRecord(() async => _recorded(VisitStatus.verified));
      return build();
    },
    act: (cubit) async {
      final first = cubit.onCodeDetected(_qr);
      await cubit.onCodeDetected(_qr);
      await cubit.onCodeDetected(_qr);
      await first;
    },
    verify: (_) {
      verify(() => location.current()).called(1);
      verify(
        () => repository.recordVisit(
          code: any(named: 'code'),
          latitude: any(named: 'latitude'),
          longitude: any(named: 'longitude'),
          accuracy: any(named: 'accuracy'),
          isMocked: any(named: 'isMocked'),
        ),
      ).called(1);
    },
  );

  for (final problem in LocationProblem.values) {
    blocTest<VisitScanCubit, VisitScanState>(
      'a position problem ($problem) fails the scan without calling the server',
      build: () {
        when(() => location.current()).thenThrow(LocationUnavailable(problem));
        return build();
      },
      act: (cubit) => cubit.onCodeDetected(_qr),
      expect: () => [
        isA<VisitScanState>().having((s) => s.status, 'status', VisitScanStatus.locating),
        isA<VisitScanState>()
            .having((s) => s.status, 'status', VisitScanStatus.failed)
            .having((s) => s.locationProblem, 'problem', problem),
      ],
      verify: (_) {
        verifyNever(
          () => repository.recordVisit(
            code: any(named: 'code'),
            latitude: any(named: 'latitude'),
            longitude: any(named: 'longitude'),
            accuracy: any(named: 'accuracy'),
            isMocked: any(named: 'isMocked'),
          ),
        );
      },
    );
  }

  blocTest<VisitScanCubit, VisitScanState>(
    'a refusal from the server (a pharmacy that is not the rep\'s) shows its code',
    build: () {
      when(() => location.current()).thenAnswer((_) async => _here);
      stubRecord(() async => throw ServerFailure('This pharmacy is not assigned to you.', code: 'PHARMACY_NOT_ASSIGNED'));
      return build();
    },
    act: (cubit) => cubit.onCodeDetected(_qr),
    verify: (cubit) {
      expect(cubit.state.status, VisitScanStatus.failed);
      expect(cubit.state.errorCode, 'PHARMACY_NOT_ASSIGNED');
      expect(cubit.state.locationProblem, isNull);
    },
  );

  blocTest<VisitScanCubit, VisitScanState>(
    'scanAgain returns to the camera after a result or a failure',
    build: () {
      when(() => location.current()).thenThrow(const LocationUnavailable(LocationProblem.unavailable));
      return build();
    },
    act: (cubit) async {
      await cubit.onCodeDetected(_qr);
      cubit.scanAgain();
    },
    verify: (cubit) {
      expect(cubit.state.status, VisitScanStatus.scanning);
      expect(cubit.state.locationProblem, isNull);
      expect(cubit.state.notFeniqCode, isFalse);
    },
  );
}
