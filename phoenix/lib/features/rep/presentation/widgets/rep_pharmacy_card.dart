import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/presentation/utils/rep_labels.dart';

/// A pharmacy in the rep's list: where it is, and how long since they were
/// there - the part that says "go here next".
class RepPharmacyCard extends StatelessWidget {
  const RepPharmacyCard({super.key, required this.pharmacy, required this.onTap, DateTime? now}) : _now = now;

  final RepPharmacy pharmacy;
  final VoidCallback onTap;
  final DateTime? _now;

  // A pharmacy not seen for this long (or never) is shown in the brand orange.
  static const int _staleAfterDays = 7;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final now = _now ?? DateTime.now();
    final last = pharmacy.activity.lastVisitAt;
    final stale = last == null || now.difference(last).inDays >= _staleAfterDays;
    final place = [pharmacy.city, pharmacy.address].whereType<String>().where((s) => s.trim().isNotEmpty).join(' · ');

    return CustomCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  repPharmacyName(context, pharmacy.nameAr, pharmacy.nameEn),
                  style: context.textTheme.titleSmall,
                ),
              ),
              Icon(Icons.chevron_right, size: AppSizes.iconSizeSmall, color: AppColors.textSecondaryOf(context)),
            ],
          ),
          if (place.isNotEmpty) ...[
            const SizedBox(height: AppSizes.spacingXSmall),
            Text(
              place,
              style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
            ),
          ],
          const SizedBox(height: AppSizes.spacingSmall),
          Row(
            children: [
              Icon(
                last == null ? Icons.location_off_outlined : Icons.place_outlined,
                size: AppSizes.iconSizeSmall,
                color: stale ? AppColors.primaryOf(context) : AppColors.textSecondaryOf(context),
              ),
              const SizedBox(width: AppSizes.spacingXSmall),
              Expanded(
                child: Text(
                  lastVisitText(l10n, last, now),
                  style: context.textTheme.bodySmall?.copyWith(
                    color: stale ? AppColors.primaryOf(context) : AppColors.textSecondaryOf(context),
                    fontWeight: stale ? FontWeight.w700 : null,
                  ),
                ),
              ),
              Text(
                l10n.repMonthOrdersCount(pharmacy.activity.monthOrdersCount),
                style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
