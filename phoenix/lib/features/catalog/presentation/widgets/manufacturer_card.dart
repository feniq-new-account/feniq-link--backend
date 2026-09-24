import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/theme/app_text_theme.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_avatar.dart';
import 'package:feniq/core/utils/display_name.dart';

// The pharmacist's entry into a warehouse's catalog is now this card, not a
// medicine directly - tapping one filters the catalog down to this
// manufacturer's own medicines (see ManufacturersView). A vertical tile
// (logo area over the name) rather than a wide row - matches the grid-of-
// tiles convention used for warehouses/products elsewhere in the app.
class ManufacturerCard extends StatelessWidget {
  const ManufacturerCard({super.key, required this.manufacturer, required this.onSelect});

  final ManufacturerModel manufacturer;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return CustomCard(
      onTap: onSelect,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AspectRatio(
            aspectRatio: 1.6,
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.surfaceOf(context),
                borderRadius: AppRadius.medium,
              ),
              // The admin-set logo, or the first letter in a coloured circle.
              child: ManufacturerAvatar(
                name: manufacturer.name,
                id: manufacturer.id,
                logoUrl: manufacturer.logoUrl,
              ),
            ),
          ),
          const SizedBox(height: AppSizes.spacingSmall),
          Text(
            // The name in the UI language, else the other one; the filter still
            // sends manufacturer.name (the Arabic name it matches on).
            pickName(
              manufacturer.name,
              manufacturer.nameEn,
              arabic: Localizations.localeOf(context).languageCode == 'ar',
            ),
            textAlign: TextAlign.center,
            style: context.textTheme.titleSmall,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: AppSizes.spacingXSmall),
          // Display-only: the warehouse's standing discount for this
          // manufacturer, straight off the model (0 shows as "0%", never
          // hidden). The exact stored figure is shown - a whole number as
          // "15%", a fractional one (the warehouse's Discounts form accepts
          // those) as "25.5%", never rounded. Green = the app's "positive /
          // saving" colour, matching the discounted-price figure on ProductCard.
          Text(
            l10n.companyDiscountValue(_formatPercent(manufacturer.discountPercentage)),
            textAlign: TextAlign.center,
            style: context.textTheme.bodySmall?.copyWith(
              color: AppColors.secondaryOf(context),
              fontWeight: AppTextTheme.semiBold,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  // The percentage exactly as the warehouse set it, with a redundant ".0"
  // trimmed: 15 -> "15", 25.5 -> "25.5", 0 -> "0". No rounding - the figure
  // must match what the warehouse's Discounts screen shows.
  static String _formatPercent(num value) {
    return value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toString();
  }
}
