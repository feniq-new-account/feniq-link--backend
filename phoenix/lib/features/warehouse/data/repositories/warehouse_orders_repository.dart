import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';

abstract class WarehouseOrdersRepository {
  /// One page of the warehouse's orders, oldest first. [status] filters the
  /// list ('pending' also holds an order left in an older waiting stage);
  /// null is every order.
  Future<WarehouseOrdersPage> getOrders({String? status, String? after});

  Future<WarehouseOrderDetail> getOrder(String orderId);

  /// Moves the order one stage on: approve & send, then delivered.
  Future<AdvancedOrderStatus> advance(String orderId);

  /// Corrects an order still awaiting approval: new quantities by order-item
  /// id, and the lines to drop. The server reprices the whole order.
  Future<WarehouseOrderDetail> updateItems(
    String orderId, {
    Map<String, int> quantities = const {},
    List<String> removals = const [],
  });
}
