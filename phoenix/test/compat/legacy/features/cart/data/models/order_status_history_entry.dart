// Copied unchanged from main (a0ff7cf) phoenix/lib/features/cart/data/models/order_status_history_entry.dart - the model the
// installed (old) pharmacy app parses with. Only package:feniq/ imports are
// rewritten to point at the other copies. Do not edit: see ../old_app_compat_test.dart.
class OrderStatusHistoryEntry {
  const OrderStatusHistoryEntry({required this.status, required this.changedAt});

  final String status;
  final DateTime changedAt;

  factory OrderStatusHistoryEntry.fromJson(Map<String, dynamic> json) => OrderStatusHistoryEntry(
    status: json['status'] as String,
    changedAt: DateTime.parse(json['changedAt'] as String),
  );
}
