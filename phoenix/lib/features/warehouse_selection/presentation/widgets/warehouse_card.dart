import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';

/// A single accessible navigation target. Compact square tiles reserve enough
/// room for up to two lines of Arabic; large-text mode can grow vertically.
class WarehouseCard extends StatelessWidget {
  const WarehouseCard({super.key, required this.warehouse, required this.onSelect});

  final WarehouseModel warehouse;
  final VoidCallback onSelect;

  static const double logoHeight = 78;

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final name = isArabic ? warehouse.nameAr : warehouse.nameEn;

    return CustomCard(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
      onTap: onSelect,
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Square 2-column mobile grids have less vertical room than tablets.
          // Scale *content*, not the text size, so Arabic names remain legible.
          final available = constraints.maxHeight;
          final tight = available.isFinite && available < 125;
          final compact = available.isFinite && available < 162;
          final logoSize = tight ? 46.0 : compact ? 56.0 : logoHeight;
          final gap = tight ? 3.0 : compact ? 5.0 : 9.0;
          return Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.center,
                child: ClipRRect(
                  borderRadius: AppRadius.small,
                  child: SizedBox.square(
                    dimension: logoSize,
                    child: AppNetworkImage(
                      url: warehouse.logo,
                      fit: BoxFit.contain,
                      fallback: ColoredBox(
                        color: AppColors.textOf(context).withValues(alpha: 0.06),
                        child: Icon(
                          Icons.warehouse_outlined,
                          color: AppColors.textSecondaryOf(context),
                          size: compact ? 26 : 36,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              SizedBox(height: gap),
              Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: AppColors.textOf(context),
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                ),
              ),
              SizedBox(height: gap),
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
                  const SizedBox(width: 3),
                  Icon(
                    isArabic ? Icons.chevron_left_rounded : Icons.chevron_right_rounded,
                    size: 16,
                    color: AppColors.primaryTextOf(context),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
