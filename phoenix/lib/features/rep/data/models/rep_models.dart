// Models for the rep's own app (backend/src/viewmodels/rep.viewmodel.js).
// Tolerant on purpose: every optional field reads as null/0 when the server
// leaves it out, so an older or newer server never crashes a screen.

DateTime? _date(Object? value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;

int _int(Object? value) => value is num ? value.toInt() : 0;

/// How a scan turned out. `verified` is the only one that counts as a visit
/// the warehouse can rely on; the rest are stored too, so the warehouse sees
/// them (repVisit.model.js).
enum VisitStatus {
  verified,
  outOfRange,
  mockLocation,
  noPharmacyLocation;

  static VisitStatus parse(Object? value) {
    switch (value) {
      case 'verified':
        return VisitStatus.verified;
      case 'out_of_range':
        return VisitStatus.outOfRange;
      case 'mock_location':
        return VisitStatus.mockLocation;
      case 'no_pharmacy_location':
      default:
        return VisitStatus.noPharmacyLocation;
    }
  }

  bool get isVerified => this == VisitStatus.verified;
}

class RepWarehouse {
  const RepWarehouse({required this.id, required this.nameAr, required this.nameEn, this.phone, this.logo});

  final String id;
  final String nameAr;
  final String nameEn;
  final String? phone;
  final String? logo;

  factory RepWarehouse.fromJson(Map<String, dynamic> json) => RepWarehouse(
    id: json['id'] as String,
    nameAr: (json['nameAr'] as String?) ?? '',
    nameEn: (json['nameEn'] as String?) ?? '',
    phone: json['phone'] as String?,
    logo: json['logo'] as String?,
  );
}

class RepStats {
  const RepStats({
    this.pharmacyCount = 0,
    this.visitsLast7Days = 0,
    this.monthOrdersCount = 0,
    this.monthOrdersTotal = 0,
  });

  final int pharmacyCount;
  final int visitsLast7Days;
  final int monthOrdersCount;
  final int monthOrdersTotal;

  factory RepStats.fromJson(Map<String, dynamic>? json) => RepStats(
    pharmacyCount: _int(json?['pharmacyCount']),
    visitsLast7Days: _int(json?['visitsLast7Days']),
    monthOrdersCount: _int(json?['monthOrdersCount']),
    monthOrdersTotal: _int(json?['monthOrdersTotal']),
  );
}

/// GET /rep/me - the rep, the warehouse that employs them, and their numbers.
class RepMe {
  const RepMe({required this.name, required this.phone, required this.warehouse, required this.stats});

  final String name;
  final String phone;
  final RepWarehouse? warehouse;
  final RepStats stats;

  factory RepMe.fromJson(Map<String, dynamic> json) {
    final rep = json['rep'] as Map<String, dynamic>;
    final warehouse = json['warehouse'];
    return RepMe(
      name: (rep['name'] as String?) ?? '',
      phone: (rep['phone'] as String?) ?? '',
      warehouse: warehouse is Map<String, dynamic> ? RepWarehouse.fromJson(warehouse) : null,
      stats: RepStats.fromJson(json['stats'] as Map<String, dynamic>?),
    );
  }
}

class RepPharmacyActivity {
  const RepPharmacyActivity({
    this.lastVisitAt,
    this.lastVerifiedVisitAt,
    this.lastOrderAt,
    this.monthOrdersCount = 0,
    this.monthOrdersTotal = 0,
  });

  final DateTime? lastVisitAt;
  final DateTime? lastVerifiedVisitAt;
  final DateTime? lastOrderAt;
  final int monthOrdersCount;
  final int monthOrdersTotal;

  factory RepPharmacyActivity.fromJson(Map<String, dynamic>? json) => RepPharmacyActivity(
    lastVisitAt: _date(json?['lastVisitAt']),
    lastVerifiedVisitAt: _date(json?['lastVerifiedVisitAt']),
    lastOrderAt: _date(json?['lastOrderAt']),
    monthOrdersCount: _int(json?['monthOrdersCount']),
    monthOrdersTotal: _int(json?['monthOrdersTotal']),
  );
}

/// A pharmacy assigned to the rep, with how recently they were there.
class RepPharmacy {
  const RepPharmacy({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    this.ownerName,
    this.address,
    this.city,
    this.phone,
    this.hasLocation = false,
    this.activity = const RepPharmacyActivity(),
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final String? ownerName;
  final String? address;
  final String? city;
  final String? phone;

  /// False when the pharmacy never set its map location: a scan there can
  /// only be recorded as `noPharmacyLocation`, never verified.
  final bool hasLocation;
  final RepPharmacyActivity activity;

  factory RepPharmacy.fromJson(Map<String, dynamic> json) => RepPharmacy(
    id: json['id'] as String,
    nameAr: (json['nameAr'] as String?) ?? '',
    nameEn: (json['nameEn'] as String?) ?? '',
    ownerName: json['ownerName'] as String?,
    address: json['address'] as String?,
    city: json['city'] as String?,
    phone: json['phone'] as String?,
    hasLocation: json['hasLocation'] == true,
    activity: RepPharmacyActivity.fromJson(json['activity'] as Map<String, dynamic>?),
  );
}

class RepOrder {
  const RepOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.finalPrice,
    this.createdAt,
  });

  final String id;
  final int orderNumber;
  final String status;
  final num finalPrice;
  final DateTime? createdAt;

  factory RepOrder.fromJson(Map<String, dynamic> json) => RepOrder(
    id: json['id'] as String,
    orderNumber: _int(json['orderNumber']),
    status: (json['status'] as String?) ?? '',
    finalPrice: (json['finalPrice'] as num?) ?? 0,
    createdAt: _date(json['createdAt']),
  );
}

class RepVisit {
  const RepVisit({
    required this.id,
    required this.status,
    required this.scannedAt,
    this.distanceMeters,
    this.accuracyMeters,
    this.pharmacyId,
    this.pharmacyNameAr,
    this.pharmacyNameEn,
  });

  final String id;
  final VisitStatus status;
  final DateTime? scannedAt;
  final int? distanceMeters;
  final int? accuracyMeters;

  // Only on rows of the visits list, which spans many pharmacies.
  final String? pharmacyId;
  final String? pharmacyNameAr;
  final String? pharmacyNameEn;

  factory RepVisit.fromJson(Map<String, dynamic> json) {
    final pharmacy = json['pharmacy'];
    return RepVisit(
      id: json['id'] as String,
      status: VisitStatus.parse(json['status']),
      scannedAt: _date(json['scannedAt']),
      distanceMeters: (json['distanceMeters'] as num?)?.round(),
      accuracyMeters: (json['accuracyMeters'] as num?)?.round(),
      pharmacyId: pharmacy is Map<String, dynamic> ? pharmacy['id'] as String? : null,
      pharmacyNameAr: pharmacy is Map<String, dynamic> ? pharmacy['nameAr'] as String? : null,
      pharmacyNameEn: pharmacy is Map<String, dynamic> ? pharmacy['nameEn'] as String? : null,
    );
  }
}

/// GET /rep/pharmacies/:id - the pharmacy, its latest orders to this
/// warehouse and the rep's latest visits there.
class RepPharmacyDetail {
  const RepPharmacyDetail({required this.pharmacy, required this.orders, required this.visits});

  final RepPharmacy pharmacy;
  final List<RepOrder> orders;
  final List<RepVisit> visits;

  factory RepPharmacyDetail.fromJson(Map<String, dynamic> json) => RepPharmacyDetail(
    pharmacy: RepPharmacy.fromJson(json['pharmacy'] as Map<String, dynamic>),
    orders: ((json['orders'] as List?) ?? const []).map((e) => RepOrder.fromJson(e as Map<String, dynamic>)).toList(),
    visits: ((json['visits'] as List?) ?? const []).map((e) => RepVisit.fromJson(e as Map<String, dynamic>)).toList(),
  );
}

/// One page of GET /rep/visits.
class RepVisitsPage {
  const RepVisitsPage({required this.visits, required this.hasMore, this.nextCursor});

  final List<RepVisit> visits;
  final bool hasMore;
  final String? nextCursor;

  factory RepVisitsPage.fromJson(Map<String, dynamic> json) {
    final pagination = json['pagination'] as Map<String, dynamic>?;
    return RepVisitsPage(
      visits: ((json['visits'] as List?) ?? const []).map((e) => RepVisit.fromJson(e as Map<String, dynamic>)).toList(),
      hasMore: pagination?['hasMore'] == true,
      nextCursor: pagination?['nextCursor'] as String?,
    );
  }
}

/// The answer to POST /rep/visits.
class RecordedVisit {
  const RecordedVisit({
    required this.visit,
    required this.pharmacyNameAr,
    required this.pharmacyNameEn,
    required this.duplicate,
  });

  final RepVisit visit;
  final String pharmacyNameAr;
  final String pharmacyNameEn;

  /// The same pharmacy was already scanned moments ago: the server returned
  /// that visit instead of counting a second one.
  final bool duplicate;

  factory RecordedVisit.fromJson(Map<String, dynamic> json) {
    final pharmacy = (json['pharmacy'] as Map<String, dynamic>?) ?? const {};
    return RecordedVisit(
      visit: RepVisit.fromJson(json['visit'] as Map<String, dynamic>),
      pharmacyNameAr: (pharmacy['nameAr'] as String?) ?? '',
      pharmacyNameEn: (pharmacy['nameEn'] as String?) ?? '',
      duplicate: json['duplicate'] == true,
    );
  }
}

/// GET /pharmacy/visit-code - what the pharmacy shows for a rep to scan.
class VisitCode {
  const VisitCode({required this.code, required this.qrPayload});

  final String code;
  final String qrPayload;

  factory VisitCode.fromJson(Map<String, dynamic> json) =>
      VisitCode(code: json['code'] as String, qrPayload: json['qrPayload'] as String);
}
