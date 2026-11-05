import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:feniq/features/pharmacy_license/data/pharmacy_license_repository.dart';
import 'package:feniq/features/pharmacy_license/presentation/pharmacy_license_view.dart';

class FakeLicenceRepository implements PharmacyLicenseRepository {
  FakeLicenceRepository(this.status);
  final PharmacyLicenseStatus status;
  @override
  Future<PharmacyLicenseStatus> fetchStatus() async => status;
  @override
  Future<PharmacyLicenseStatus> submitPhoto(XFile image) async => status;
}

void main() {
  test('licence JSON parses optional dates and never needs raw document IDs', () {
    final value = PharmacyLicenseStatus.fromJson({
      'status': 'pending',
      'revision': 2,
      'submittedAt': '2026-11-05T11:00:00Z',
      'dueAt': null,
      'hasDocument': true,
    });
    expect(value.status, 'pending');
    expect(value.revision, 2);
    expect(value.submittedAt, isNotNull);
    expect(value.dueAt, isNull);
    expect(value.hasDocument, isTrue);
  });

  testWidgets('Arabic licence view shows deadline and upload entry points', (tester) async {
    final repo = FakeLicenceRepository(PharmacyLicenseStatus(
      status: 'not_submitted',
      revision: 0,
      hasDocument: false,
      dueAt: DateTime.utc(2026, 11, 19),
    ));
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ar'),
      home: PharmacyLicenseView(repository: repo),
    ));
    await tester.pumpAndSettle();
    expect(find.text('لم تُرسل الرخصة بعد'), findsOneWidget);
    expect(find.textContaining('2026-11-19'), findsOneWidget);
    await tester.ensureVisible(find.text('اختيار صورة الرخصة'));
    expect(find.text('اختيار صورة الرخصة'), findsOneWidget);
    expect(find.text('تصوير الرخصة'), findsOneWidget);
  });

  testWidgets('approved licence cannot be resubmitted', (tester) async {
    final repo = FakeLicenceRepository(const PharmacyLicenseStatus(
      status: 'approved', revision: 1, hasDocument: true,
    ));
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: PharmacyLicenseView(repository: repo),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Licence approved'), findsOneWidget);
    expect(find.text('Choose licence photo'), findsNothing);
    expect(find.text('Take a licence photo'), findsNothing);
  });

  testWidgets('rejected licence displays reviewer reason and resubmission', (tester) async {
    final repo = FakeLicenceRepository(const PharmacyLicenseStatus(
      status: 'rejected',
      revision: 1,
      hasDocument: true,
      reviewNote: 'Please submit a clearer photo',
    ));
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: PharmacyLicenseView(repository: repo),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Resubmission required'), findsOneWidget);
    expect(find.textContaining('Please submit a clearer photo'), findsOneWidget);
    expect(find.text('Choose licence photo'), findsOneWidget);
  });
}
