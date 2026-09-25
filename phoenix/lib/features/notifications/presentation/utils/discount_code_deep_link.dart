import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/features/catalog/data/models/manufacturers_route_args.dart';
import 'package:feniq/routes/route_names.dart';

/// Where tapping "you have a discount code" goes - from a push (FcmService)
/// and from the in-app inbox (NotificationCenterView) alike.
///
/// A warehouse's code works only on that warehouse's orders, so it opens that
/// warehouse (the same screen as picking it from the warehouse list). An
/// admin's code works on every warehouse, so there is no one warehouse to open
/// and it goes to the warehouse list instead.
void openDiscountCodeTarget(BuildContext context, {String? warehouseId, String? warehouseName}) {
  if (warehouseId != null && warehouseId.isNotEmpty) {
    context.pushNamed(
      RouteNames.manufacturers,
      pathParameters: {'warehouseId': warehouseId},
      extra: ManufacturersRouteArgs(warehouseName: warehouseName ?? ''),
    );
    return;
  }
  context.goNamed(RouteNames.warehouseSelection);
}

/// The local-notification payload for a discount-code push, parsed back with
/// [parseWarehousePayload]: `warehouse:<id>|<name>`, or `warehouses:all` for
/// an admin code. The id never contains '|', so the name may.
String discountCodePayload(Map<String, dynamic> data) {
  final warehouseId = '${data['relatedWarehouseId'] ?? ''}';
  if (warehouseId.isEmpty) return 'warehouses:all';
  return 'warehouse:$warehouseId|${data['warehouseName'] ?? ''}';
}

/// ([warehouseId], [warehouseName]) from a `warehouse:` payload's value (the
/// part after the prefix).
({String warehouseId, String warehouseName}) parseWarehousePayload(String value) {
  final bar = value.indexOf('|');
  if (bar < 0) return (warehouseId: value, warehouseName: '');
  return (warehouseId: value.substring(0, bar), warehouseName: value.substring(bar + 1));
}
