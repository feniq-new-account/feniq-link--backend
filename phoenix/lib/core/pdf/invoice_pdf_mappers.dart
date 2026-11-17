import 'package:feniq/core/pdf/invoice_pdf.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/generated/app_localizations.dart';

// The two invoices the app can save as PDF. Each lists exactly the rows its
// on-screen invoice card shows, from the same stored order figures - the PDF
// never recomputes a discount or a total, so it cannot disagree with the
// screen or with the pharmacy's statement.

InvoicePdfHeaders _headers(AppLocalizations l10n) => InvoicePdfHeaders(
      item: l10n.invoicePdfItem,
      quantity: l10n.invoicePdfQuantity,
      unitPrice: l10n.invoicePdfUnitPrice,
      lineTotal: l10n.invoicePdfLineTotal,
      free: l10n.invoicePdfFree,
    );

/// The pharmacy's own order (order tracking) - mirrors OrderInvoiceSection.
InvoicePdfData pharmacyInvoicePdf(AppLocalizations l10n, OrderModel order, {required bool arabic}) {
  final warehouse = arabic ? (order.warehouseNameAr ?? order.warehouseNameEn) : (order.warehouseNameEn ?? order.warehouseNameAr);
  final code = order.discountCode;
  return InvoicePdfData(
    title: l10n.invoicePdfTitle,
    orderNumber: order.orderNumber,
    date: order.createdAt,
    fromLabel: warehouse == null ? null : l10n.invoicePdfFrom(warehouse),
    rtl: arabic,
    currencySuffix: l10n.currencySuffix,
    headers: _headers(l10n),
    footer: l10n.invoicePdfFooter,
    lines: [
      for (final item in order.items)
        InvoicePdfLine(
          name: item.displayName,
          manufacturer: item.displayManufacturer,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity,
          unitPriceSyp: item.discountPrice,
          lineTotalSyp: item.lineTotal,
        ),
    ],
    totals: [
      InvoicePdfTotal(l10n.subtotalLabel, order.totalPrice),
      if (order.discountAmount > 0) InvoicePdfTotal(l10n.discountLabel, -order.discountAmount),
      if (order.advertisementDiscountAmount > 0)
        InvoicePdfTotal(l10n.advertisementDiscountLabel, -order.advertisementDiscountAmount),
      if (order.loyaltyDiscountAmount > 0) InvoicePdfTotal(l10n.loyaltyDiscountLine, -order.loyaltyDiscountAmount),
      if (order.creditUsedSyp > 0) InvoicePdfTotal(l10n.creditUsedLine, -order.creditUsedSyp),
      if (code != null && code.discountSyp > 0) InvoicePdfTotal(l10n.discountCodeLine(code.code), -code.discountSyp),
      InvoicePdfTotal(l10n.invoiceTotalLabel, order.finalPrice, emphasized: true),
    ],
  );
}

/// The warehouse's view of an order - the pharmacy-facing rows of its money
/// card only. The rep and Feniq shares are internal and never printed.
InvoicePdfData warehouseInvoicePdf(AppLocalizations l10n, WarehouseOrderDetail order, {required bool arabic}) {
  final pharmacy = order.pharmacy == null
      ? null
      : (arabic ? order.pharmacy!.nameAr : englishFirst(order.pharmacy!.nameEn, order.pharmacy!.nameAr));
  final otherDiscounts = order.totalPrice - order.finalPrice - order.loyaltyDiscountAmount - order.creditUsedSyp;
  return InvoicePdfData(
    title: l10n.invoicePdfTitle,
    orderNumber: order.orderNumber,
    date: order.createdAt,
    toLabel: pharmacy == null || pharmacy.isEmpty ? null : l10n.invoicePdfTo(pharmacy),
    rtl: arabic,
    currencySuffix: l10n.currencySuffix,
    headers: _headers(l10n),
    footer: l10n.invoicePdfFooter,
    lines: [
      for (final item in order.items)
        InvoicePdfLine(
          name: englishFirst(item.productNameEn, item.productNameAr),
          manufacturer: englishFirstOrNull(item.manufacturerEn, item.manufacturerAr),
          quantity: item.quantity,
          freeQuantity: item.freeQuantity,
          unitPriceSyp: item.discountPrice,
          lineTotalSyp: item.lineTotal,
        ),
    ],
    totals: [
      InvoicePdfTotal(l10n.warehouseSubtotal, order.totalPrice),
      if (otherDiscounts > 0) InvoicePdfTotal(l10n.warehouseDiscounts, -otherDiscounts),
      if (order.loyaltyDiscountAmount > 0) InvoicePdfTotal(l10n.warehouseLoyaltyLine, -order.loyaltyDiscountAmount),
      if (order.creditUsedSyp > 0) InvoicePdfTotal(l10n.warehouseCreditUsedLine, -order.creditUsedSyp),
      InvoicePdfTotal(l10n.warehousePharmacyPays, order.finalPrice, emphasized: true),
    ],
  );
}
