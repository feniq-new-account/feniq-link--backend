import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/whatsapp_button.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';

/// Compact at ordinary text sizes; full names and accessibility text grow
/// the grid row instead of clipping or reducing the font size.
class WarehouseCard extends StatelessWidget {
  const WarehouseCard({super.key, required this.warehouse, required this.onSelect, required this.onViewProfile});

  final WarehouseModel warehouse;
  final VoidCallback onSelect;
  final VoidCallback onViewProfile;
  static const double logoHeight = 40;
  static const double _actionHeight = 48;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final name = isArabic ? warehouse.nameAr : warehouse.nameEn;
    return CustomCard(
      padding: const EdgeInsets.all(10),
      onTap: onSelect,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: AppRadius.small,
                child: SizedBox.square(
                  dimension: logoHeight,
                  child: AppNetworkImage(
                    url: warehouse.logo,
                    fit: BoxFit.contain,
                    fallback: ColoredBox(
                      color: AppColors.textOf(context).withValues(alpha: 0.06),
                      child: Icon(Icons.local_shipping_outlined, color: AppColors.textSecondaryOf(context), size: 24),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  name,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, height: 1.25),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            warehouse.city,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.textSecondaryOf(context)),
          ),
          const Spacer(),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onViewProfile,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.textOf(context),
                    side: BorderSide(color: AppColors.borderOf(context)),
                    shape: const RoundedRectangleBorder(borderRadius: AppRadius.small),
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                    minimumSize: const Size(0, _actionHeight),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    l10n.warehouseProfileButtonLabel,
                    textAlign: TextAlign.center,
                    style: Theme.of(
                      context,
                    ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600, color: AppColors.textOf(context)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              WhatsAppButton(phone: warehouse.phone, size: _actionHeight),
            ],
          ),
        ],
      ),
    );
  }
}
