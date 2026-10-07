import 'package:flutter/widgets.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/cart/presentation/utils/order_status_label.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/generated/app_localizations.dart';

/// The pill tone of an order status, the same on the list and the detail.
StatusBadgeTone warehouseStatusTone(String status) {
  if (isAwaitingApproval(status)) return StatusBadgeTone.pending;
  return switch (status) {
    'delivered' => StatusBadgeTone.success,
    'cancelled' => StatusBadgeTone.danger,
    _ => StatusBadgeTone.info,
  };
}

/// The label of a status tab; null is "all".
String warehouseFilterLabel(AppLocalizations l10n, String? filter) =>
    filter == null ? l10n.warehouseFilterAll : orderStatusLabel(l10n, filter);

/// What the one forward button says for an order in [status], or null when
/// there is no step left.
String? warehouseAdvanceLabel(AppLocalizations l10n, String status) {
  final next = nextWarehouseStatus(status);
  if (next == 'out_for_delivery') return l10n.warehouseApproveAndSend;
  if (next == 'delivered') return l10n.warehouseMarkDelivered;
  return null;
}

/// The confirmation shown before the forward step: (title, body).
(String, String) warehouseAdvanceConfirm(AppLocalizations l10n, String status, int orderNumber) {
  if (nextWarehouseStatus(status) == 'delivered') {
    return (l10n.warehouseConfirmDeliveredTitle, l10n.warehouseConfirmDeliveredBody(orderNumber));
  }
  return (l10n.warehouseConfirmApproveTitle, l10n.warehouseConfirmApproveBody(orderNumber));
}

/// A rate without trailing zeros: 2 -> "2", 1.5 -> "1.5".
String warehouseRate(double value) {
  final rounded = (value * 100).round() / 100;
  return rounded == rounded.roundToDouble() ? rounded.toInt().toString() : rounded.toString();
}

/// The pharmacy's name in the reader's language, falling back to the other.
String warehousePharmacyName(BuildContext context, WarehouseOrderPharmacy? pharmacy) {
  if (pharmacy == null) return '';
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  final preferred = arabic ? pharmacy.nameAr : pharmacy.nameEn;
  if (preferred.trim().isNotEmpty) return preferred;
  return arabic ? pharmacy.nameEn : pharmacy.nameAr;
}
