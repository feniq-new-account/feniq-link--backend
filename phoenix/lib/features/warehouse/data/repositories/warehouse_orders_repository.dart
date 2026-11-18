import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';

abstract class WarehouseOrdersRepository {
  /// One page of the warehouse's orders, oldest first. [status] filters the
  /// list ('pending' also holds an order left in an older waiting stage);
  /// null is every order.
  Future<WarehouseOrdersPage> getOrders({String? status, String? after});

  Future<WarehouseOrderDetail> getOrder(String orderId);

  /// Moves the order one stage on: approve & send, then delivered.
  Future<AdvancedOrderStatus> advance(
    String orderId, {
    String? expectedStatus,
    String? targetStatus,
  });

  /// Corrects an order still awaiting approval: new quantities by order-item
  /// id, the lines to drop, and products to add (quantity by product id - a
  /// substitute for one that ran out, say). The server reprices the whole
  /// order and tells the pharmacy it was changed.
  Future<WarehouseOrderDetail> updateItems(
    String orderId, {
    Map<String, int> quantities = const {},
    List<String> removals = const [],
    Map<String, int> additions = const {},
  });

  /// The warehouse's own products a pharmacy could receive now, matching
  /// [query] (name or manufacturer). One page, enough for a picker.
  Future<List<WarehouseProductHit>> searchProducts(String query);
}
