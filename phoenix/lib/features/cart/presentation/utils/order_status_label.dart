import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/generated/app_localizations.dart';

// Shared between the status history list, the progress bar labels, and the
// "my orders" list badge - one switch over orders.status, not three.
//
// Where an order stands now (badge, highlight card):
//   pending          -> Waiting for approval / بانتظار الموافقة
//   out_for_delivery -> On the way / بالطريق
//   delivered        -> Delivered / تم التسليم
// 'confirmed' / 'preparing' are no longer reached (the warehouse approves
// straight into "on the way"); an older order in one reads as waiting.
String orderStatusLabel(AppLocalizations l10n, String status) {
  switch (status) {
    case 'pending':
    case 'confirmed':
    case 'preparing':
      return l10n.stageUnderReview;
    case 'out_for_delivery':
      return l10n.stageOutForDelivery;
    case 'delivered':
      return l10n.stageDelivered;
    case 'cancelled':
      return l10n.stageCancelled;
    // Not a real order.status value - only ever appears as a statusHistory
    // entry pushed when the warehouse edits a still-pending order's items
    // (see backend/src/services/warehouseOrder.service.js's
    // updateOrderItems). The order's own status stays 'pending'.
    case 'modified':
      return l10n.stageModified;
    default:
      return status;
  }
}

// One line in the order's history: the 'pending' entry is the moment it was
// sent; every other entry reads like the order's status at that point.
String orderHistoryLabel(AppLocalizations l10n, String status) {
  switch (status) {
    case 'pending':
      return l10n.stageSent;
    case 'preparing':
      return l10n.stagePreparing;
    default:
      return orderStatusLabel(l10n, status);
  }
}

// A step of the tracking bar.
String orderStageLabel(AppLocalizations l10n, OrderStage stage) => switch (stage) {
  OrderStage.sent => l10n.stageSent,
  OrderStage.modified => l10n.stageModified,
  OrderStage.awaitingApproval => l10n.stageUnderReview,
  OrderStage.outForDelivery => l10n.stageOutForDelivery,
  OrderStage.delivered => l10n.stageDelivered,
};

// The one-line user-facing description shown under the current stage on the
// tracking screen. Null for statuses that carry none (cancelled, modified,
// unknown).
String? orderStatusDescription(AppLocalizations l10n, String status) {
  switch (status) {
    case 'pending':
    case 'confirmed':
    case 'preparing':
      return l10n.stageUnderReviewDesc;
    case 'out_for_delivery':
      return l10n.stageOutForDeliveryDesc;
    case 'delivered':
      return l10n.stageDeliveredDesc;
    default:
      return null;
  }
}
