import 'package:flutter/widgets.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/cart/presentation/utils/order_status_label.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/generated/app_localizations.dart';

/// The pill tone of an order status, the same on the list and the detail.
StatusBadgeTone warehouseStatusTone(String status) {
  if (status == 'pending') return StatusBadgeTone.pending;
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
  if (next == 'confirmed') return l10n.warehouseAccept;
  if (next == 'out_for_delivery') return l10n.warehouseSendOnWay;
  if (next == 'delivered') return l10n.warehouseMarkDelivered;
  return null;
}

/// The confirmation shown before the forward step: (title, body), or null
/// when the step needs none - accepting is one tap, and "delivered" asks
/// whether it was paid instead (collect_payment_sheet.dart).
(String, String)? warehouseAdvanceConfirm(AppLocalizations l10n, String status, int orderNumber) {
  return switch (nextWarehouseStatus(status)) {
    'out_for_delivery' => (l10n.warehouseConfirmApproveTitle, l10n.warehouseConfirmApproveBody(orderNumber)),
    _ => null,
  };
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

/// A name in the reader's language, falling back to the other.
String warehouseLocalName(BuildContext context, String? nameAr, String? nameEn) {
  final ar = nameAr ?? '';
  final en = nameEn ?? '';
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  final preferred = arabic ? ar : en;
  if (preferred.trim().isNotEmpty) return preferred;
  return arabic ? en : ar;
}

/// The pill tone of a return status.
StatusBadgeTone warehouseReturnTone(String status) => switch (status) {
  'approved' => StatusBadgeTone.success,
  'rejected' => StatusBadgeTone.danger,
  _ => StatusBadgeTone.pending,
};

String warehousePaymentMethodLabel(AppLocalizations l10n, String method) => switch (method) {
  'cash' => l10n.warehousePaymentMethodCash,
  'bank_transfer' => l10n.warehousePaymentMethodBank,
  'cheque' => l10n.warehousePaymentMethodCheque,
  _ => l10n.warehousePaymentMethodOther,
};
