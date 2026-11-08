import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';

/// One full-card navigation target. SliverRowGrid uses IntrinsicHeight, so
/// keep this card intrinsic-measurement safe: let names wrap fully and rows
/// grow rather than truncating company names or using LayoutBuilder.
class WarehouseCard extends StatelessWidget {
  const WarehouseCard({super.key, required this.warehouse, required this.onSelect});

  final WarehouseModel warehouse;
  final VoidCallback onSelect;

  static const double logoHeight = 70;

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final name = isArabic ? warehouse.nameAr : warehouse.nameEn;
    return CustomCard(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      onTap: onSelect,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.center,
            child: ClipRRect(
              borderRadius: AppRadius.small,
              child: SizedBox.square(
                dimension: logoHeight,
                child: AppNetworkImage(
                  url: warehouse.logo,
                  fit: BoxFit.contain,
                  fallback: ColoredBox(
                    color: AppColors.textOf(context).withValues(alpha: 0.06),
                    child: Icon(
                      Icons.warehouse_outlined,
                      color: AppColors.textSecondaryOf(context),
                      size: 30,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            name,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: AppColors.textOf(context),
              fontWeight: FontWeight.w800,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  isArabic ? 'تصفح المنتجات' : 'Browse products',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: AppColors.primaryTextOf(context),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                isArabic ? Icons.chevron_left_rounded : Icons.chevron_right_rounded,
                size: 17,
                color: AppColors.primaryTextOf(context),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
