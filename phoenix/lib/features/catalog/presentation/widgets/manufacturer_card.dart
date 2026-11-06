import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/theme/app_text_theme.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/catalog/data/models/manufacturer_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_avatar.dart';

/// Compact, tappable company card. Logos get a clean circular white surface
/// (many uploaded logos have an intrinsic white, square background); no
/// second navy rectangle or always-visible "0%" discount wastes space.
class ManufacturerCard extends StatelessWidget {
  const ManufacturerCard({
    super.key,
    required this.manufacturer,
    required this.onSelect,
  });

  final ManufacturerModel manufacturer;
  final VoidCallback onSelect;

  static const double logoSize = 72;

  @override
  Widget build(BuildContext context) {
    final name = manufacturer.displayName;
    final hasLogo = manufacturer.logoUrl?.trim().isNotEmpty == true;
    final hasDiscount = manufacturer.discountPercentage > 0;

    return CustomCard(
      onTap: onSelect,
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 10),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (hasLogo)
            ClipOval(
              child: Container(
                width: logoSize,
                height: logoSize,
                padding: const EdgeInsets.all(8),
                color: const Color(0xFFF9FAFC),
                child: ManufacturerAvatar(
                  name: name,
                  id: manufacturer.id,
                  logoUrl: manufacturer.logoUrl,
                ),
              ),
            )
          else
            SizedBox.square(
              dimension: logoSize,
              child: ManufacturerAvatar(
                name: name,
                id: manufacturer.id,
              ),
            ),
          const SizedBox(height: AppSizes.spacingSmall),
          Tooltip(
            message: name,
            child: Text(
              name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: context.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
                height: 1.15,
              ),
            ),
          ),
          if (hasDiscount) ...[
            const SizedBox(height: AppSizes.spacingXSmall),
            Text(
              context.l10n.companyDiscountValue(
                _formatPercent(manufacturer.discountPercentage),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: context.textTheme.bodySmall?.copyWith(
                color: AppColors.secondaryOf(context),
                fontWeight: AppTextTheme.semiBold,
                fontSize: 11.5,
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Keep configured fractional percentages exact, never round financial data.
  static String _formatPercent(num value) {
    return value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toString();
  }
}
