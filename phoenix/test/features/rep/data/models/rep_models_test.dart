import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';

void main() {
  group('VisitStatus.parse', () {
    test('maps the four server statuses, and anything unknown to "no pharmacy location"', () {
      expect(VisitStatus.parse('verified'), VisitStatus.verified);
      expect(VisitStatus.parse('out_of_range'), VisitStatus.outOfRange);
      expect(VisitStatus.parse('mock_location'), VisitStatus.mockLocation);
      expect(VisitStatus.parse('no_pharmacy_location'), VisitStatus.noPharmacyLocation);
      expect(VisitStatus.parse('something_new'), VisitStatus.noPharmacyLocation);
      expect(VisitStatus.parse(null), VisitStatus.noPharmacyLocation);
      expect(VisitStatus.verified.isVerified, isTrue);
      expect(VisitStatus.outOfRange.isVerified, isFalse);
    });
  });

  group('RepMe.fromJson', () {
    test('reads the rep, the warehouse and the numbers', () {
      final me = RepMe.fromJson({
        'success': true,
        'rep': {'id': 'r1', 'name': 'أحمد', 'phone': '+963940000201', 'isActive': true},
        'warehouse': {'id': 'w1', 'nameAr': 'مستودع تجريبي', 'nameEn': 'Demo Warehouse', 'phone': '0930000200', 'logo': null},
        'stats': {'pharmacyCount': 3, 'visitsLast7Days': 2, 'monthOrdersCount': 21, 'monthOrdersTotal': 15502575},
      });
      expect(me.name, 'أحمد');
      expect(me.phone, '+963940000201');
      expect(me.warehouse?.nameEn, 'Demo Warehouse');
      expect(me.stats.pharmacyCount, 3);
      expect(me.stats.visitsLast7Days, 2);
      expect(me.stats.monthOrdersCount, 21);
      expect(me.stats.monthOrdersTotal, 15502575);
    });

    test('reads the rep\'s own commission, and an older server without it reads as none', () {
      final withCommission = RepMe.fromJson({
        'rep': {'id': 'r1', 'name': 'أحمد', 'phone': '+963940000201'},
        'stats': {'ownCommissionRate': 1.25, 'monthCommissionAmount': 4500},
      });
      expect(withCommission.stats.ownCommissionRate, 1.25);
      expect(withCommission.stats.monthCommissionAmount, 4500);
      expect(withCommission.stats.hasCommission, isTrue);

      final without = RepMe.fromJson({
        'rep': {'id': 'r1', 'name': 'أحمد', 'phone': '+963940000201'},
        'stats': {'pharmacyCount': 1},
      });
      expect(without.stats.ownCommissionRate, 0);
      expect(without.stats.monthCommissionAmount, 0);
      expect(without.stats.hasCommission, isFalse);
    });

    test('a missing warehouse and missing stats read as none and zeros', () {
      final me = RepMe.fromJson({
        'rep': {'id': 'r1', 'name': 'ليلى', 'phone': '+963940000202'},
        'warehouse': null,
      });
      expect(me.warehouse, isNull);
      expect(me.stats.pharmacyCount, 0);
      expect(me.stats.monthOrdersTotal, 0);
    });
  });

  group('RepPharmacy.fromJson', () {
    test('reads the pharmacy and how recently it was visited', () {
      final pharmacy = RepPharmacy.fromJson({
        'id': 'p1',
        'nameAr': 'صيدلية الياسمين',
        'nameEn': 'Al-Yasmin Pharmacy',
        'ownerName': 'د. سلمى',
        'address': 'اللاذقية',
        'city': 'Latakia',
        'phone': '+963931000001',
        'hasLocation': true,
        'activity': {
          'lastVisitAt': '2026-10-05T10:00:00.000Z',
          'lastVerifiedVisitAt': null,
          'lastOrderAt': '2026-10-06T08:30:00.000Z',
          'monthOrdersCount': 7,
          'monthOrdersTotal': 5167525,
        },
      });
      expect(pharmacy.id, 'p1');
      expect(pharmacy.nameAr, 'صيدلية الياسمين');
      expect(pharmacy.hasLocation, isTrue);
      expect(pharmacy.activity.lastVisitAt, DateTime.utc(2026, 10, 5, 10).toLocal());
      expect(pharmacy.activity.lastVerifiedVisitAt, isNull);
      expect(pharmacy.activity.monthOrdersCount, 7);
    });

    test('a pharmacy with nothing else known still parses', () {
      final pharmacy = RepPharmacy.fromJson({'id': 'p2', 'nameAr': 'صيدلية', 'nameEn': ''});
      expect(pharmacy.hasLocation, isFalse);
      expect(pharmacy.ownerName, isNull);
      expect(pharmacy.activity.lastVisitAt, isNull);
      expect(pharmacy.activity.monthOrdersCount, 0);
    });
  });

  group('RepPharmacyDetail.fromJson', () {
    test('reads the pharmacy with its orders and visits', () {
      final detail = RepPharmacyDetail.fromJson({
        'pharmacy': {'id': 'p1', 'nameAr': 'صيدلية', 'nameEn': 'Pharmacy', 'hasLocation': true},
        'orders': [
          {'id': 'o1', 'orderNumber': 12, 'status': 'delivered', 'finalPrice': 6140, 'createdAt': '2026-10-06T08:00:00.000Z'},
        ],
        'visits': [
          {'id': 'v1', 'status': 'verified', 'distanceMeters': 12.4, 'accuracyMeters': 8, 'scannedAt': '2026-10-06T09:00:00.000Z'},
        ],
      });
      expect(detail.orders.single.orderNumber, 12);
      expect(detail.orders.single.finalPrice, 6140);
      expect(detail.visits.single.status, VisitStatus.verified);
      expect(detail.visits.single.distanceMeters, 12);
    });
  });

  group('RepVisitsPage.fromJson', () {
    test('reads the rows with their pharmacy and the paging', () {
      final page = RepVisitsPage.fromJson({
        'visits': [
          {
            'id': 'v1',
            'status': 'out_of_range',
            'distanceMeters': 480,
            'scannedAt': '2026-10-06T09:00:00.000Z',
            'pharmacy': {'id': 'p1', 'nameAr': 'صيدلية الفجر', 'nameEn': 'Al-Fajr Pharmacy'},
          },
        ],
        'pagination': {'hasMore': true, 'nextCursor': 'abc'},
      });
      expect(page.visits.single.status, VisitStatus.outOfRange);
      expect(page.visits.single.pharmacyNameEn, 'Al-Fajr Pharmacy');
      expect(page.hasMore, isTrue);
      expect(page.nextCursor, 'abc');
    });

    test('no pagination block means the last page', () {
      final page = RepVisitsPage.fromJson({'visits': []});
      expect(page.visits, isEmpty);
      expect(page.hasMore, isFalse);
      expect(page.nextCursor, isNull);
    });
  });

  group('RecordedVisit.fromJson', () {
    test('a new visit', () {
      final recorded = RecordedVisit.fromJson({
        'success': true,
        'duplicate': false,
        'visit': {'id': 'v1', 'status': 'verified', 'distanceMeters': 5, 'scannedAt': '2026-10-06T09:00:00.000Z'},
        'pharmacy': {'id': 'p1', 'nameAr': 'صيدلية', 'nameEn': 'Pharmacy'},
      });
      expect(recorded.duplicate, isFalse);
      expect(recorded.visit.status.isVerified, isTrue);
      expect(recorded.pharmacyNameEn, 'Pharmacy');
    });

    test('a repeat of a visit moments ago', () {
      final recorded = RecordedVisit.fromJson({
        'duplicate': true,
        'visit': {'id': 'v1', 'status': 'verified', 'scannedAt': '2026-10-06T09:00:00.000Z'},
        'pharmacy': {'id': 'p1', 'nameAr': 'صيدلية', 'nameEn': 'Pharmacy'},
      });
      expect(recorded.duplicate, isTrue);
    });
  });

  test('VisitCode.fromJson', () {
    final code = VisitCode.fromJson({'code': 'ABCDEFGHJKMNPQRS', 'qrPayload': 'FENIQ-VISIT:ABCDEFGHJKMNPQRS'});
    expect(code.code, 'ABCDEFGHJKMNPQRS');
    expect(code.qrPayload, 'FENIQ-VISIT:ABCDEFGHJKMNPQRS');
  });
}
