// Models for a warehouse account's reps, pharmacy accounts and returns in the
// app (backend/src/viewmodels/rep.viewmodel.js, accountStatement.viewmodel.js,
// warehouseReturn.viewmodel.js). Tolerant on purpose, like the order models.
import 'package:feniq/features/debts/data/models/debt_detail_model.dart';

DateTime? _date(Object? value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;

int _int(Object? value) => value is num ? value.toInt() : 0;

double _double(Object? value) => value is num ? value.toDouble() : 0;

double? _doubleOrNull(Object? value) => value is num ? value.toDouble() : null;

String _str(Object? value) => value is String ? value : (value?.toString() ?? '');

String? _strOrNull(Object? value) => value is String && value.isNotEmpty ? value : null;

List<Map<String, dynamic>> _maps(Object? value) =>
    value is List ? value.whereType<Map>().map(Map<String, dynamic>.from).toList() : const [];

Map<String, dynamic>? _map(Object? value) => value is Map ? Map<String, dynamic>.from(value) : null;

(bool, String?) _pagination(Map<String, dynamic> json) {
  final pagination = _map(json['pagination']);
  return (pagination?['hasMore'] == true, pagination?['nextCursor']?.toString());
}

// --- Reps ---------------------------------------------------------------

/// The rep's share of this month's commission, split three ways.
class RepMonthCommission {
  const RepMonthCommission({this.repAmount = 0, this.feniqAmount = 0, this.pharmacyAmount = 0, this.savingAmount = 0});

  final double repAmount;
  final double feniqAmount;
  final double pharmacyAmount;
  final double savingAmount;

  factory RepMonthCommission.fromJson(Map<String, dynamic>? json) => RepMonthCommission(
    repAmount: _double(json?['repAmount']),
    feniqAmount: _double(json?['feniqAmount']),
    pharmacyAmount: _double(json?['pharmacyAmount']),
    savingAmount: _double(json?['savingAmount']),
  );
}

class WarehouseRep {
  const WarehouseRep({
    required this.id,
    required this.name,
    required this.phone,
    this.isActive = true,
    this.commissionRate = 0,
    this.warehouseShareToRep = false,
    this.pharmacyCount = 0,
    this.visits30d = 0,
    this.unverifiedVisits30d = 0,
    this.lastVisitAt,
    this.monthOrdersCount = 0,
    this.monthOrdersTotal = 0,
    this.monthCommission = const RepMonthCommission(),
  });

  final String id;
  final String name;
  final String phone;
  final bool isActive;
  // In percent: 2 means 2% of an order.
  final double commissionRate;
  // The warehouse gives this rep its own quarter of the commission too.
  final bool warehouseShareToRep;
  final int pharmacyCount;
  final int visits30d;
  final int unverifiedVisits30d;
  final DateTime? lastVisitAt;
  final int monthOrdersCount;
  final double monthOrdersTotal;
  final RepMonthCommission monthCommission;

  /// The list row's numbers kept, the account fields taken from [rep] (what
  /// an update answers with).
  WarehouseRep withAccount(WarehouseRep rep) => WarehouseRep(
    id: id,
    name: rep.name,
    phone: rep.phone,
    isActive: rep.isActive,
    commissionRate: rep.commissionRate,
    warehouseShareToRep: rep.warehouseShareToRep,
    pharmacyCount: pharmacyCount,
    visits30d: visits30d,
    unverifiedVisits30d: unverifiedVisits30d,
    lastVisitAt: lastVisitAt,
    monthOrdersCount: monthOrdersCount,
    monthOrdersTotal: monthOrdersTotal,
    monthCommission: monthCommission,
  );

  factory WarehouseRep.fromJson(Map<String, dynamic> json) => WarehouseRep(
    id: _str(json['id']),
    name: _str(json['name']),
    phone: _str(json['phone']),
    isActive: json['isActive'] != false,
    commissionRate: _double(json['commissionRate']),
    warehouseShareToRep: json['warehouseShareToRep'] == true,
    pharmacyCount: _int(json['pharmacyCount']),
    visits30d: _int(json['visits30d']),
    unverifiedVisits30d: _int(json['unverifiedVisits30d']),
    lastVisitAt: _date(json['lastVisitAt']),
    monthOrdersCount: _int(json['monthOrdersCount']),
    monthOrdersTotal: _double(json['monthOrdersTotal']),
    monthCommission: RepMonthCommission.fromJson(_map(json['monthCommission'])),
  );
}

class RepAssignedPharmacy {
  const RepAssignedPharmacy({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    this.city,
    this.phone,
    this.lastVisitAt,
    this.monthOrdersCount = 0,
    this.monthOrdersTotal = 0,
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final String? city;
  final String? phone;
  final DateTime? lastVisitAt;
  final int monthOrdersCount;
  final double monthOrdersTotal;

  factory RepAssignedPharmacy.fromJson(Map<String, dynamic> json) {
    final activity = _map(json['activity']);
    return RepAssignedPharmacy(
      id: _str(json['id']),
      nameAr: _str(json['nameAr']),
      nameEn: _str(json['nameEn']),
      city: _strOrNull(json['city']),
      phone: _strOrNull(json['phone']),
      lastVisitAt: _date(activity?['lastVisitAt']),
      monthOrdersCount: _int(activity?['monthOrdersCount']),
      monthOrdersTotal: _double(activity?['monthOrdersTotal']),
    );
  }
}

/// One scan of a pharmacy's visit QR, as the warehouse sees it.
class WarehouseRepVisit {
  const WarehouseRepVisit({
    required this.id,
    required this.status,
    this.scannedAt,
    this.distanceMeters,
    this.repName,
    this.pharmacyNameAr,
    this.pharmacyNameEn,
  });

  final String id;
  // verified / out_of_range / mock_location / no_pharmacy_location
  final String status;
  final DateTime? scannedAt;
  final double? distanceMeters;
  final String? repName;
  final String? pharmacyNameAr;
  final String? pharmacyNameEn;

  bool get isVerified => status == 'verified';

  factory WarehouseRepVisit.fromJson(Map<String, dynamic> json) {
    final rep = _map(json['rep']);
    final pharmacy = _map(json['pharmacy']);
    return WarehouseRepVisit(
      id: _str(json['id']),
      status: _str(json['status']),
      scannedAt: _date(json['scannedAt']),
      distanceMeters: _doubleOrNull(json['distanceMeters']),
      repName: _strOrNull(rep?['name']),
      pharmacyNameAr: _strOrNull(pharmacy?['nameAr']),
      pharmacyNameEn: _strOrNull(pharmacy?['nameEn']),
    );
  }
}

class WarehouseRepVisitsPage {
  const WarehouseRepVisitsPage({required this.visits, this.hasMore = false, this.nextCursor});

  final List<WarehouseRepVisit> visits;
  final bool hasMore;
  final String? nextCursor;

  factory WarehouseRepVisitsPage.fromJson(Map<String, dynamic> json) {
    final (hasMore, cursor) = _pagination(json);
    return WarehouseRepVisitsPage(
      visits: _maps(json['visits']).map(WarehouseRepVisit.fromJson).toList(),
      hasMore: hasMore,
      nextCursor: cursor,
    );
  }
}

// --- Pharmacy accounts ----------------------------------------------------

/// One pharmacy the warehouse trades with, and where its account stands.
class WarehouseAccountRow {
  const WarehouseAccountRow({
    required this.pharmacyId,
    required this.nameAr,
    required this.nameEn,
    this.phone,
    this.balanceSyp = 0,
    this.lastActivityAt,
    this.purchasesSyp = 0,
    this.paidSyp = 0,
    this.lastPaymentAt,
  });

  final String pharmacyId;
  final String nameAr;
  final String nameEn;
  final String? phone;
  // Positive: the pharmacy owes. Negative: it is in credit.
  final double balanceSyp;
  final DateTime? lastActivityAt;
  // What it bought (delivered orders) and paid, and when it last paid.
  final double purchasesSyp;
  final double paidSyp;
  final DateTime? lastPaymentAt;

  double get outstandingDebtSyp => balanceSyp > 0 ? balanceSyp : 0;
  double get creditBalanceSyp => balanceSyp < 0 ? -balanceSyp : 0;

  factory WarehouseAccountRow.fromJson(Map<String, dynamic> json) => WarehouseAccountRow(
    pharmacyId: _str(json['pharmacyId']),
    nameAr: _str(json['nameAr']),
    nameEn: _str(json['nameEn']),
    phone: _strOrNull(json['phone']),
    balanceSyp: _double(json['balanceSyp']),
    lastActivityAt: _date(json['lastActivityAt']),
    purchasesSyp: _double(json['purchasesSyp']),
    paidSyp: _double(json['paidSyp']),
    lastPaymentAt: _date(json['lastPaymentAt']),
  );
}

class WarehouseAccountsPage {
  const WarehouseAccountsPage({required this.accounts, this.hasMore = false, this.nextCursor});

  final List<WarehouseAccountRow> accounts;
  final bool hasMore;
  final String? nextCursor;

  factory WarehouseAccountsPage.fromJson(Map<String, dynamic> json) {
    final (hasMore, cursor) = _pagination(json);
    return WarehouseAccountsPage(
      accounts: _maps(json['pharmacies']).map(WarehouseAccountRow.fromJson).toList(),
      hasMore: hasMore,
      nextCursor: cursor,
    );
  }
}

/// What a period added up to: delivered sales, money collected, returns.
class SummaryTotals {
  const SummaryTotals({
    this.salesSyp = 0,
    this.collectionsSyp = 0,
    this.returnsSyp = 0,
    this.invoiceCount = 0,
    this.paymentCount = 0,
  });

  final double salesSyp;
  final double collectionsSyp;
  final double returnsSyp;
  final int invoiceCount;
  final int paymentCount;

  factory SummaryTotals.fromJson(Map<String, dynamic>? json) => SummaryTotals(
    salesSyp: _double(json?['salesSyp']),
    collectionsSyp: _double(json?['collectionsSyp']),
    returnsSyp: _double(json?['returnsSyp']),
    invoiceCount: _int(json?['invoiceCount']),
    paymentCount: _int(json?['paymentCount']),
  );
}

/// A pharmacy next to one amount - a top buyer's sales or a top debtor's debt.
class SummaryPharmacyAmount {
  const SummaryPharmacyAmount({
    required this.pharmacyId,
    required this.nameAr,
    required this.nameEn,
    required this.amountSyp,
  });

  final String pharmacyId;
  final String nameAr;
  final String nameEn;
  final double amountSyp;

  factory SummaryPharmacyAmount.fromJson(Map<String, dynamic> json, {required String amountKey}) {
    final pharmacy = _map(json['pharmacy']);
    return SummaryPharmacyAmount(
      pharmacyId: _str(pharmacy?['id']),
      nameAr: _str(pharmacy?['nameAr']),
      nameEn: _str(pharmacy?['nameEn']),
      amountSyp: _double(json[amountKey]),
    );
  }
}

/// Where the warehouse stands right now, whatever the period chosen.
class SummaryOutstanding {
  const SummaryOutstanding({
    this.totalDebtSyp = 0,
    this.totalCreditSyp = 0,
    this.debtorCount = 0,
    this.topDebtors = const [],
  });

  final double totalDebtSyp;
  // What the warehouse holds for pharmacies that paid ahead.
  final double totalCreditSyp;
  final int debtorCount;
  final List<SummaryPharmacyAmount> topDebtors;

  factory SummaryOutstanding.fromJson(Map<String, dynamic>? json) => SummaryOutstanding(
    totalDebtSyp: _double(json?['totalDebtSyp']),
    totalCreditSyp: _double(json?['totalCreditSyp']),
    debtorCount: _int(json?['debtorCount']),
    topDebtors: _maps(
      json?['topDebtors'],
    ).map((r) => SummaryPharmacyAmount.fromJson(r, amountKey: 'balanceSyp')).toList(),
  );
}

/// The owner's summary (GET /warehouse/balances/summary): the chosen period
/// next to the previous one of equal length, the top buyers, and the debts.
/// Sales count delivered orders only.
class WarehouseSummary {
  const WarehouseSummary({
    this.current = const SummaryTotals(),
    this.previous = const SummaryTotals(),
    this.topBuyers = const [],
    this.outstanding = const SummaryOutstanding(),
  });

  final SummaryTotals current;
  final SummaryTotals previous;
  final List<SummaryPharmacyAmount> topBuyers;
  final SummaryOutstanding outstanding;

  factory WarehouseSummary.fromJson(Map<String, dynamic> json) {
    final summary = _map(json['summary']);
    return WarehouseSummary(
      current: SummaryTotals.fromJson(_map(summary?['current'])),
      previous: SummaryTotals.fromJson(_map(summary?['previous'])),
      topBuyers: _maps(
        summary?['topBuyers'],
      ).map((r) => SummaryPharmacyAmount.fromJson(r, amountKey: 'salesSyp')).toList(),
      outstanding: SummaryOutstanding.fromJson(_map(summary?['outstanding'])),
    );
  }
}

/// Percent change against the previous period, or null when it was empty
/// (nothing to compare with).
int? summaryPercentChange(double current, double previous) {
  // A previous period that netted to zero or below has no meaningful base:
  // dividing by a negative flips the sign and would call a rise a fall.
  if (previous <= 0) return null;
  return ((current - previous) / previous * 100).round();
}

/// One pharmacy's account statement, from the warehouse's side.
class WarehouseStatement {
  const WarehouseStatement({
    required this.pharmacyNameAr,
    required this.pharmacyNameEn,
    required this.rows,
    required this.summary,
    this.pharmacyPhone,
    this.openingSyp = 0,
    this.closingSyp = 0,
  });

  final String pharmacyNameAr;
  final String pharmacyNameEn;
  final String? pharmacyPhone;
  final double openingSyp;
  // Positive: the pharmacy owes. Negative: it is in credit.
  final double closingSyp;
  final StatementSummary summary;
  final List<StatementRowModel> rows;

  double get outstandingDebtSyp => closingSyp > 0 ? closingSyp : 0;
  double get creditBalanceSyp => closingSyp < 0 ? -closingSyp : 0;

  factory WarehouseStatement.fromJson(Map<String, dynamic> json) {
    final statement = _map(json['statement']) ?? const {};
    final pharmacy = _map(statement['pharmacy']);
    return WarehouseStatement(
      pharmacyNameAr: _str(pharmacy?['nameAr']),
      pharmacyNameEn: _str(pharmacy?['nameEn']),
      pharmacyPhone: _strOrNull(pharmacy?['phone']),
      openingSyp: _double(_map(statement['opening'])?['syp']),
      closingSyp: _double(_map(statement['closing'])?['syp']),
      summary: StatementSummary.fromJson(_map(statement['summary'])),
      rows: _maps(statement['rows']).map(StatementRowModel.fromJson).toList(),
    );
  }
}

/// How a payment was received (backend payment.service.js METHODS).
const List<String> kPaymentMethods = ['cash', 'bank_transfer', 'cheque', 'other'];

// --- Returns ----------------------------------------------------------------

class WarehouseReturnItem {
  const WarehouseReturnItem({
    required this.quantity,
    required this.reasonType,
    this.productNameAr,
    this.productNameEn,
    this.customReason,
  });

  final int quantity;
  // damaged / wrong_item / other
  final String reasonType;
  final String? productNameAr;
  final String? productNameEn;
  final String? customReason;

  factory WarehouseReturnItem.fromJson(Map<String, dynamic> json) => WarehouseReturnItem(
    quantity: _int(json['quantity']),
    reasonType: _str(json['reasonType']),
    productNameAr: _strOrNull(json['productNameAr']),
    productNameEn: _strOrNull(json['productNameEn']),
    customReason: _strOrNull(json['customReason']),
  );
}

/// A pharmacy's return request on one of the warehouse's orders.
class WarehouseReturn {
  const WarehouseReturn({
    required this.id,
    required this.status,
    required this.items,
    this.orderId,
    this.orderNumber,
    this.pharmacyNameAr,
    this.pharmacyNameEn,
    this.pharmacyPhone,
    this.notes,
    this.images = const [],
    this.rejectionNote,
    this.creditSyp,
    this.createdAt,
    this.resolvedAt,
  });

  final String id;
  // pending / approved / rejected
  final String status;
  final List<WarehouseReturnItem> items;
  final String? orderId;
  final int? orderNumber;
  final String? pharmacyNameAr;
  final String? pharmacyNameEn;
  final String? pharmacyPhone;
  final String? notes;
  final List<String> images;
  final String? rejectionNote;
  // What approving credited the pharmacy (null until approved).
  final double? creditSyp;
  final DateTime? createdAt;
  final DateTime? resolvedAt;

  bool get isPending => status == 'pending';

  int get unitCount => items.fold(0, (sum, item) => sum + item.quantity);

  WarehouseReturn resolved({required String status, String? rejectionNote, double? creditSyp, DateTime? resolvedAt}) =>
      WarehouseReturn(
        id: id,
        status: status,
        items: items,
        orderId: orderId,
        orderNumber: orderNumber,
        pharmacyNameAr: pharmacyNameAr,
        pharmacyNameEn: pharmacyNameEn,
        pharmacyPhone: pharmacyPhone,
        notes: notes,
        images: images,
        rejectionNote: rejectionNote ?? this.rejectionNote,
        creditSyp: creditSyp ?? this.creditSyp,
        createdAt: createdAt,
        resolvedAt: resolvedAt ?? this.resolvedAt,
      );

  factory WarehouseReturn.fromJson(Map<String, dynamic> json) {
    final body = _map(json['return']) ?? json;
    final orderNumber = body['orderNumber'];
    return WarehouseReturn(
      id: _str(body['id']),
      status: _str(body['status']),
      items: _maps(body['items']).map(WarehouseReturnItem.fromJson).toList(),
      orderId: _strOrNull(body['orderId']),
      orderNumber: orderNumber is num ? orderNumber.toInt() : null,
      pharmacyNameAr: _strOrNull(body['pharmacyNameAr']),
      pharmacyNameEn: _strOrNull(body['pharmacyNameEn']),
      pharmacyPhone: _strOrNull(body['pharmacyPhone']),
      notes: _strOrNull(body['notes']),
      images: body['images'] is List ? (body['images'] as List).whereType<String>().toList() : const [],
      rejectionNote: _strOrNull(body['rejectionNote']),
      creditSyp: _doubleOrNull(body['creditSyp']),
      createdAt: _date(body['createdAt']),
      resolvedAt: _date(body['resolvedAt']),
    );
  }
}

class WarehouseReturnsPage {
  const WarehouseReturnsPage({required this.returns, this.hasMore = false, this.nextCursor});

  final List<WarehouseReturn> returns;
  final bool hasMore;
  final String? nextCursor;

  factory WarehouseReturnsPage.fromJson(Map<String, dynamic> json) {
    final (hasMore, cursor) = _pagination(json);
    return WarehouseReturnsPage(
      returns: _maps(json['returns']).map(WarehouseReturn.fromJson).toList(),
      hasMore: hasMore,
      nextCursor: cursor,
    );
  }
}

/// The return status filters, in tab order. Null is "all".
const List<String?> kWarehouseReturnFilters = ['pending', 'approved', 'rejected', null];

// --- Loyalty discount ---------------------------------------------------------

/// One loyalty tier: an order of [minSyp] or more gets [discountSyp] off.
class LoyaltyTier {
  const LoyaltyTier({required this.minSyp, required this.discountSyp});

  final int minSyp;
  final int discountSyp;

  Map<String, dynamic> toJson() => {'minSyp': minSyp, 'discountSyp': discountSyp};

  factory LoyaltyTier.fromJson(Map<String, dynamic> json) =>
      LoyaltyTier(minSyp: _int(json['minSyp']), discountSyp: _int(json['discountSyp']));
}

/// The warehouse's loyalty discount: off unless it switches it on.
class WarehouseLoyalty {
  const WarehouseLoyalty({this.enabled = false, this.tiers = const [], this.mode = 'per_order', this.revision = 0});

  final bool enabled;
  final List<LoyaltyTier> tiers;

  final String mode;
  final int revision;

  factory WarehouseLoyalty.fromSettingsJson(Map<String, dynamic> json) {
    final loyalty = _map(_map(json['settings'])?['loyalty']);
    return WarehouseLoyalty(
      mode: loyalty?['mode'] == 'monthly' ? 'monthly' : 'per_order',
      revision: _int(loyalty?['revision']),
      enabled: loyalty?['enabled'] == true,
      tiers: _maps(loyalty?['tiers']).map(LoyaltyTier.fromJson).toList(),
    );
  }
}
