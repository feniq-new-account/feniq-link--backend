import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';

/// The warehouse tile is one large touch target. Profile and WhatsApp live in
/// the next screen's app bar. Only the name and slightly larger logo appear.
class WarehouseCard extends StatelessWidget {
  const WarehouseCard({
    super.key,
    required this.warehouse,
    required this.onSelect,
  });

  final WarehouseModel warehouse;
  final VoidCallback onSelect;

  static const double logoHeight = 92;

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final name = isArabic ? warehouse.nameAr : warehouse.nameEn;

    return CustomCard(
      padding: const EdgeInsets.all(10),
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
                      Icons.local_shipping_outlined,
                      color: AppColors.textSecondaryOf(context),
                      size: 36,
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
              fontWeight: FontWeight.w700,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}
