import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/cart/presentation/utils/order_status_label.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';

/// One order in the warehouse's list: who it is for, how much, where it
/// stands, and the one button that moves it on.
class WarehouseOrderCard extends StatelessWidget {
  const WarehouseOrderCard({
    super.key,
    required this.order,
    required this.onTap,
    required this.onAdvance,
    this.isAdvancing = false,
  });

  final WarehouseOrderSummary order;
  final VoidCallback onTap;
  final VoidCallback onAdvance;
  final bool isAdvancing;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final advanceLabel = warehouseAdvanceLabel(l10n, order.status);
    final city = order.pharmacy?.city;
    final createdAt = order.createdAt;

    return CustomCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              Text(
                l10n.warehouseOrderTitle(order.orderNumber),
                style: context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              StatusBadge(label: orderStatusLabel(l10n, order.status), tone: warehouseStatusTone(order.status)),
            ],
          ),
          const SizedBox(height: AppSizes.spacingSmall),
          Text(
            warehousePharmacyName(context, order.pharmacy),
            style: context.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            [
              if (city != null) city,
              if (createdAt != null) DateFormatter.formatDateTime(createdAt, locale: context.l10n.localeName),
              l10n.warehouseOrderItemsCount(order.itemCount),
            ].join(' · '),
            style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
          ),
          const SizedBox(height: AppSizes.spacingSmall),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              Text(
                formatSyp(order.finalPrice, l10n.currencySuffix),
                style: context.textTheme.titleMedium?.copyWith(
                  color: AppColors.primaryTextOf(context),
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (advanceLabel != null)
                FilledButton(
                  onPressed: isAdvancing ? null : onAdvance,
                  child: isAdvancing
                      ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(advanceLabel),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
