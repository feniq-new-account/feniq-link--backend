Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const {};
List<Map<String, dynamic>> _rows(Object? value) =>
    value is List ? value.whereType<Map>().map((row) => row.cast<String, dynamic>()).toList() : const [];
int _int(Object? value) => value is num ? value.round() : 0;

class FollowUpSettings {
  const FollowUpSettings({this.overdueDays = 15, this.inactiveDays = 15, this.revision = 0});
  final int overdueDays, inactiveDays, revision;
  factory FollowUpSettings.fromJson(Object? value) {
    final json = _map(value);
    return FollowUpSettings(
      overdueDays: _int(json['overdueDays']) > 0 ? _int(json['overdueDays']) : 15,
      inactiveDays: _int(json['inactiveDays']) > 0 ? _int(json['inactiveDays']) : 15,
      revision: _int(json['revision']),
    );
  }
  Map<String, dynamic> toJson() => {'overdueDays': overdueDays, 'inactiveDays': inactiveDays, 'revision': revision};
}

class DailyWarehouseMovement {
  const DailyWarehouseMovement({
    required this.date,
    this.netSalesSyp = 0,
    this.collectionsSyp = 0,
    this.returnsSyp = 0,
  });
  final String date;
  final int netSalesSyp, collectionsSyp, returnsSyp;
  factory DailyWarehouseMovement.fromJson(Map<String, dynamic> json) => DailyWarehouseMovement(
    date: json['date'] as String? ?? '',
    netSalesSyp: _int(json['netSalesSyp']),
    collectionsSyp: _int(json['collectionsSyp']),
    returnsSyp: _int(json['returnsSyp']),
  );
}

class WarehouseInsightsReport {
  const WarehouseInsightsReport({
    required this.asOfBusiness,
    this.daily = const [],
    this.netSalesSyp = 0,
    this.collectionsSyp = 0,
    this.returnsSyp = 0,
    this.debtSyp = 0,
    this.aging = const [0, 0, 0, 0],
    this.settings = const FollowUpSettings(),
  });
  final String asOfBusiness;
  final List<DailyWarehouseMovement> daily;
  final int netSalesSyp, collectionsSyp, returnsSyp, debtSyp;
  final List<int> aging;
  final FollowUpSettings settings;
  factory WarehouseInsightsReport.fromJson(Map<String, dynamic> json) {
    final totals = _map(json['totals']), aged = _map(json['aging']);
    final buckets = aged['buckets'];
    return WarehouseInsightsReport(
      asOfBusiness: json['asOfBusiness'] as String? ?? '',
      daily: _rows(json['daily']).map(DailyWarehouseMovement.fromJson).toList(),
      netSalesSyp: _int(totals['netSalesSyp']),
      collectionsSyp: _int(totals['collectionsSyp']),
      returnsSyp: _int(totals['returnsSyp']),
      debtSyp: _int(aged['totalDebtSyp']),
      aging: buckets is List && buckets.length == 4 ? buckets.map(_int).toList() : const [0, 0, 0, 0],
      settings: FollowUpSettings.fromJson(json['settings']),
    );
  }
}

class WarehouseFollowUpRow {
  const WarehouseFollowUpRow({
    required this.pharmacyId,
    required this.nameAr,
    required this.nameEn,
    this.phone,
    this.city = '',
    this.days = 0,
    this.overdueSyp = 0,
    this.lastOrderAt,
  });
  final String pharmacyId, nameAr, nameEn, city;
  final String? phone, lastOrderAt;
  final int days, overdueSyp;
  factory WarehouseFollowUpRow.fromJson(Map<String, dynamic> json) {
    final pharmacy = _map(json['pharmacy']);
    return WarehouseFollowUpRow(
      pharmacyId: pharmacy['id'] as String? ?? '',
      nameAr: pharmacy['nameAr'] as String? ?? '',
      nameEn: pharmacy['nameEn'] as String? ?? '',
      phone: pharmacy['phone'] as String?,
      city: pharmacy['city'] as String? ?? '',
      days: _int(json['oldestAgeDays'] ?? json['days']),
      overdueSyp: _int(json['overdueSyp']),
      lastOrderAt: json['lastOrderAt'] as String?,
    );
  }
}

class WarehouseFollowUpPage {
  const WarehouseFollowUpPage({
    this.rows = const [],
    this.total = 0,
    this.hasMore = false,
    this.nextCursor,
    this.asOfBusiness = '',
    this.settings = const FollowUpSettings(),
  });
  final List<WarehouseFollowUpRow> rows;
  final int total;
  final bool hasMore;
  final String? nextCursor;
  final String asOfBusiness;
  final FollowUpSettings settings;
  factory WarehouseFollowUpPage.fromJson(Map<String, dynamic> json) {
    final pagination = _map(json['pagination']);
    return WarehouseFollowUpPage(
      rows: _rows(json['rows']).map(WarehouseFollowUpRow.fromJson).toList(),
      total: _int(json['total']),
      hasMore: pagination['hasMore'] == true,
      nextCursor: pagination['nextCursor'] as String?,
      asOfBusiness: json['asOfBusiness'] as String? ?? '',
      settings: FollowUpSettings.fromJson(json['settings']),
    );
  }
}

class WarehouseInsightAlert {
  const WarehouseInsightAlert({required this.code, required this.count, this.amountSyp = 0});
  final String code;
  final int count, amountSyp;
  factory WarehouseInsightAlert.fromJson(Map<String, dynamic> json) => WarehouseInsightAlert(
    code: json['code'] as String? ?? '',
    count: _int(json['count']),
    amountSyp: _int(json['amountSyp']),
  );
}

class WarehouseAlertsData {
  const WarehouseAlertsData({this.alerts = const [], this.asOfBusiness = ''});
  final List<WarehouseInsightAlert> alerts;
  final String asOfBusiness;
  factory WarehouseAlertsData.fromJson(Map<String, dynamic> json) => WarehouseAlertsData(
    alerts: _rows(json['alerts']).map(WarehouseInsightAlert.fromJson).toList(),
    asOfBusiness: json['asOfBusiness'] as String? ?? '',
  );
}
