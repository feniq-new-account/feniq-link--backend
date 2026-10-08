// Models for a warehouse account's own orders in the app
// (backend/src/viewmodels/warehouseOrder.viewmodel.js). Tolerant on purpose:
// a field the server leaves out reads as null/0, so an older or newer server
// never crashes a screen.

DateTime? _date(Object? value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;

int _int(Object? value) => value is num ? value.toInt() : 0;

double _double(Object? value) => value is num ? value.toDouble() : 0;

String _str(Object? value) => value is String ? value : (value?.toString() ?? '');

String? _strOrNull(Object? value) => value is String && value.isNotEmpty ? value : null;

List<Map<String, dynamic>> _maps(Object? value) =>
    value is List ? value.whereType<Map>().map(Map<String, dynamic>.from).toList() : const [];

/// The warehouse's three stages: accept -> on the way -> delivered (the
/// pharmacy's "received" tap, or 24 hours on the way, close it too). Items can
/// change until the order leaves. 'preparing' is no longer reached; an older
/// order left in it counts as accepted.
/// Mirrors NEXT_STATUS in backend/src/services/warehouseOrder.service.js.
const List<String> kAwaitingApproval = ['pending', 'confirmed', 'preparing'];

bool isAwaitingApproval(String status) => kAwaitingApproval.contains(status);

/// The stage one tap moves an order to; null past the last one (or cancelled).
String? nextWarehouseStatus(String status) {
  if (status == 'pending') return 'confirmed';
  if (status == 'confirmed' || status == 'preparing') return 'out_for_delivery';
  if (status == 'out_for_delivery') return 'delivered';
  return null;
}

/// The status filters of the orders list, in tab order. Null is "all".
const List<String?> kWarehouseOrderFilters = [
  null,
  'pending',
  'confirmed',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

class WarehouseOrderPharmacy {
  const WarehouseOrderPharmacy({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    this.ownerName,
    this.address,
    this.city,
    this.phone,
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final String? ownerName;
  final String? address;
  final String? city;
  final String? phone;

  factory WarehouseOrderPharmacy.fromJson(Map<String, dynamic> json) => WarehouseOrderPharmacy(
    id: _str(json['id']),
    nameAr: _str(json['nameAr']),
    nameEn: _str(json['nameEn']),
    ownerName: _strOrNull(json['ownerName']),
    address: _strOrNull(json['address']),
    city: _strOrNull(json['city']),
    phone: _strOrNull(json['phone']),
  );
}

class WarehouseOrderItem {
  const WarehouseOrderItem({
    required this.id,
    required this.productNameAr,
    required this.quantity,
    this.productId,
    this.productNameEn,
    this.manufacturerAr,
    this.manufacturerEn,
    this.unitPrice = 0,
    this.discountPrice = 0,
    this.freeQuantity = 0,
    this.packageGroupId,
  });

  final String id;
  final String? productId;
  final String productNameAr;
  final String? productNameEn;
  final String? manufacturerAr;
  final String? manufacturerEn;
  final int quantity;
  final double unitPrice;
  // What the pharmacy pays per unit (the price after any offer).
  final double discountPrice;
  // Free bonus units delivered on top of [quantity], never charged.
  final int freeQuantity;
  // Set on a line that belongs to a package deal: its quantity follows the
  // package, so the server refuses to edit it on its own (PACKAGE_ITEMS_LOCKED).
  final String? packageGroupId;

  bool get isPackageLine => packageGroupId != null;

  double get lineTotal => discountPrice * quantity;

  factory WarehouseOrderItem.fromJson(Map<String, dynamic> json) => WarehouseOrderItem(
    id: _str(json['id']),
    productId: _strOrNull(json['productId']),
    productNameAr: _str(json['productNameAr']),
    productNameEn: _strOrNull(json['productNameEn']),
    manufacturerAr: _strOrNull(json['manufacturerAr']),
    manufacturerEn: _strOrNull(json['manufacturerEn']),
    quantity: _int(json['quantity']),
    unitPrice: _double(json['unitPrice']),
    discountPrice: _double(json['discountPrice']),
    freeQuantity: _int(json['freeQuantity']),
    packageGroupId: _strOrNull(json['packageGroupId']),
  );
}

/// One row of the orders list.
class WarehouseOrderSummary {
  const WarehouseOrderSummary({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.finalPrice,
    required this.itemCount,
    this.pharmacy,
    this.notes,
    this.createdAt,
  });

  final String id;
  final int orderNumber;
  final String status;
  final double finalPrice;
  final int itemCount;
  final WarehouseOrderPharmacy? pharmacy;
  final String? notes;
  final DateTime? createdAt;

  WarehouseOrderSummary copyWith({String? status, double? finalPrice, int? itemCount}) => WarehouseOrderSummary(
    id: id,
    orderNumber: orderNumber,
    status: status ?? this.status,
    finalPrice: finalPrice ?? this.finalPrice,
    itemCount: itemCount ?? this.itemCount,
    pharmacy: pharmacy,
    notes: notes,
    createdAt: createdAt,
  );

  factory WarehouseOrderSummary.fromJson(Map<String, dynamic> json) {
    final pharmacy = json['pharmacy'];
    return WarehouseOrderSummary(
      id: _str(json['id']),
      orderNumber: _int(json['orderNumber']),
      status: _str(json['status']),
      finalPrice: _double(json['finalPrice']),
      itemCount: _maps(json['items']).length,
      pharmacy: pharmacy is Map<String, dynamic> ? WarehouseOrderPharmacy.fromJson(pharmacy) : null,
      notes: _strOrNull(json['notes']),
      createdAt: _date(json['createdAt']),
    );
  }
}

class WarehouseOrdersPage {
  const WarehouseOrdersPage({required this.orders, this.hasMore = false, this.nextCursor});

  final List<WarehouseOrderSummary> orders;
  final bool hasMore;
  final String? nextCursor;

  factory WarehouseOrdersPage.fromJson(Map<String, dynamic> json) {
    final pagination = json['pagination'];
    final cursor = pagination is Map ? pagination['nextCursor'] : null;
    return WarehouseOrdersPage(
      orders: _maps(json['orders']).map(WarehouseOrderSummary.fromJson).toList(),
      hasMore: pagination is Map && pagination['hasMore'] == true,
      nextCursor: cursor?.toString(),
    );
  }
}

/// The rep's commission on this order, frozen when it was placed, in four
/// quarters: Feniq, the pharmacy (as credit), the rep, and the warehouse's own
/// quarter - which it keeps ([savingAmount]) or gives to the rep
/// ([warehouseShareToRep], then inside [repAmount]).
class WarehouseRepCommission {
  const WarehouseRepCommission({
    required this.rate,
    required this.repAmount,
    required this.feniqAmount,
    required this.savingAmount,
    this.pharmacyAmount = 0,
    this.warehouseShareToRep = false,
  });

  final double rate;
  final double repAmount;
  final double feniqAmount;
  final double savingAmount;
  final double pharmacyAmount;
  final bool warehouseShareToRep;

  factory WarehouseRepCommission.fromJson(Map<String, dynamic> json) => WarehouseRepCommission(
    rate: _double(json['rate']),
    repAmount: _double(json['repAmount']),
    feniqAmount: _double(json['feniqAmount']),
    savingAmount: _double(json['savingAmount']),
    pharmacyAmount: _double(json['pharmacyAmount']),
    warehouseShareToRep: json['warehouseShareToRep'] == true,
  );
}

class WarehouseOrderHistoryEntry {
  const WarehouseOrderHistoryEntry({required this.status, this.changedAt, this.note});

  final String status;
  final DateTime? changedAt;
  final String? note;

  factory WarehouseOrderHistoryEntry.fromJson(Map<String, dynamic> json) => WarehouseOrderHistoryEntry(
    status: _str(json['status']),
    changedAt: _date(json['changedAt']),
    note: _strOrNull(json['note']),
  );
}

/// A package deal on the order: its lines are edited on the panel.
class WarehouseOrderPackage {
  const WarehouseOrderPackage({required this.id, required this.copies, this.titleAr, this.titleEn, this.totalPriceSyp = 0});

  final String id;
  final int copies;
  final String? titleAr;
  final String? titleEn;
  final double totalPriceSyp;

  factory WarehouseOrderPackage.fromJson(Map<String, dynamic> json) => WarehouseOrderPackage(
    id: _str(json['id']),
    copies: _int(json['copies']),
    titleAr: _strOrNull(json['titleAr']),
    titleEn: _strOrNull(json['titleEn']),
    totalPriceSyp: _double(json['totalPriceSyp']),
  );
}

class WarehouseOrderDetail {
  const WarehouseOrderDetail({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.items,
    this.pharmacy,
    this.totalPrice = 0,
    this.discountAmount = 0,
    this.advertisementDiscountAmount = 0,
    this.commissionAmount = 0,
    this.platformCompensationSyp = 0,
    this.finalPrice = 0,
    this.warehouseNetSyp = 0,
    this.repCommission,
    this.loyaltyDiscountAmount = 0,
    this.creditUsedSyp = 0,
    this.packages = const [],
    this.statusHistory = const [],
    this.notes,
    this.cancelReason,
    this.createdAt,
    this.requiresDeliverySealPhoto = false,
    this.deliverySealPhoto,
    this.hasReturn = false,
  });

  final String id;
  final int orderNumber;
  final String status;
  final List<WarehouseOrderItem> items;
  final WarehouseOrderPharmacy? pharmacy;
  final double totalPrice;
  final double discountAmount;
  final double advertisementDiscountAmount;
  final double commissionAmount;
  final double platformCompensationSyp;
  // What the pharmacy pays.
  final double finalPrice;
  // What the warehouse keeps, once Feniq's share comes off.
  final double warehouseNetSyp;
  final WarehouseRepCommission? repCommission;
  // The warehouse's loyalty discount on this order, and the pharmacy credit
  // it used - both already off finalPrice.
  final double loyaltyDiscountAmount;
  final double creditUsedSyp;
  final List<WarehouseOrderPackage> packages;
  final List<WarehouseOrderHistoryEntry> statusHistory;
  final String? notes;
  final String? cancelReason;
  final DateTime? createdAt;
  final bool requiresDeliverySealPhoto;
  final String? deliverySealPhoto;
  final bool hasReturn;

  bool get isEditable => isAwaitingApproval(status);

  String? get nextStatus => nextWarehouseStatus(status);

  /// On the way, and the pharmacy has not attached the seal photo the order
  /// asks for yet: the server refuses "delivered" until it does.
  bool get isWaitingForSealPhoto =>
      status == 'out_for_delivery' && requiresDeliverySealPhoto && deliverySealPhoto == null;

  WarehouseOrderDetail withStatus(String status, List<WarehouseOrderHistoryEntry> history) => WarehouseOrderDetail(
    id: id,
    orderNumber: orderNumber,
    status: status,
    items: items,
    pharmacy: pharmacy,
    totalPrice: totalPrice,
    discountAmount: discountAmount,
    advertisementDiscountAmount: advertisementDiscountAmount,
    commissionAmount: commissionAmount,
    platformCompensationSyp: platformCompensationSyp,
    finalPrice: finalPrice,
    warehouseNetSyp: warehouseNetSyp,
    repCommission: repCommission,
    loyaltyDiscountAmount: loyaltyDiscountAmount,
    creditUsedSyp: creditUsedSyp,
    packages: packages,
    statusHistory: history.isEmpty ? statusHistory : history,
    notes: notes,
    cancelReason: cancelReason,
    createdAt: createdAt,
    requiresDeliverySealPhoto: requiresDeliverySealPhoto,
    deliverySealPhoto: deliverySealPhoto,
    hasReturn: hasReturn,
  );

  factory WarehouseOrderDetail.fromJson(Map<String, dynamic> json) {
    final order = json['order'] is Map<String, dynamic> ? json['order'] as Map<String, dynamic> : json;
    final pharmacy = order['pharmacy'];
    final rep = order['repCommission'];
    return WarehouseOrderDetail(
      id: _str(order['id']),
      orderNumber: _int(order['orderNumber']),
      status: _str(order['status']),
      items: _maps(order['items']).map(WarehouseOrderItem.fromJson).toList(),
      pharmacy: pharmacy is Map<String, dynamic> ? WarehouseOrderPharmacy.fromJson(pharmacy) : null,
      totalPrice: _double(order['totalPrice']),
      discountAmount: _double(order['discountAmount']),
      advertisementDiscountAmount: _double(order['advertisementDiscountAmount']),
      commissionAmount: _double(order['commissionAmount']),
      platformCompensationSyp: _double(order['platformCompensationSyp']),
      finalPrice: _double(order['finalPrice']),
      warehouseNetSyp: _double(order['warehouseNetSyp']),
      repCommission: rep is Map<String, dynamic> ? WarehouseRepCommission.fromJson(rep) : null,
      loyaltyDiscountAmount: _double(order['loyaltyDiscountAmount']),
      creditUsedSyp: _double(order['creditUsedSyp']),
      packages: _maps(order['packageGroups']).map(WarehouseOrderPackage.fromJson).toList(),
      statusHistory: _maps(order['statusHistory']).map(WarehouseOrderHistoryEntry.fromJson).toList(),
      notes: _strOrNull(order['notes']),
      cancelReason: _strOrNull(order['cancelReason']),
      createdAt: _date(order['createdAt']),
      requiresDeliverySealPhoto: order['requiresDeliverySealPhoto'] == true,
      deliverySealPhoto: _strOrNull(order['deliverySealPhoto']),
      hasReturn: order['hasReturn'] == true,
    );
  }
}

/// The server's answer to one advance: the new status and its history.
class AdvancedOrderStatus {
  const AdvancedOrderStatus({required this.status, this.statusHistory = const []});

  final String status;
  final List<WarehouseOrderHistoryEntry> statusHistory;

  factory AdvancedOrderStatus.fromJson(Map<String, dynamic> json) {
    final order = json['order'] is Map<String, dynamic> ? json['order'] as Map<String, dynamic> : json;
    return AdvancedOrderStatus(
      status: _str(order['status']),
      statusHistory: _maps(order['statusHistory']).map(WarehouseOrderHistoryEntry.fromJson).toList(),
    );
  }
}
