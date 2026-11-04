import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/presentation/utils/rep_labels.dart';

/// One visit: when, how it turned out, and how far the phone was. With
/// [showPharmacy] it also names the pharmacy (the visits list spans many).
class RepVisitTile extends StatelessWidget {
  const RepVisitTile({super.key, required this.visit, this.showPharmacy = true});

  final RepVisit visit;
  final bool showPharmacy;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final when = visit.scannedAt == null
        ? ''
        : DateFormatter.formatDateTime(visit.scannedAt!, locale: context.l10n.localeName);
    final distance = visit.distanceMeters;
    final name = repPharmacyName(context, visit.pharmacyNameAr ?? '', visit.pharmacyNameEn ?? '');

    return CustomCard(
      padding: const EdgeInsets.all(AppSizes.spacingMedium),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (showPharmacy && name.isNotEmpty) Text(name, style: context.textTheme.titleSmall),
                Text(when, style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context))),
                if (distance != null)
                  Text(
                    l10n.repDistanceMeters(distance),
                    style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSizes.spacingSmall),
          StatusBadge(label: visitStatusLabel(l10n, visit.status), tone: visitStatusTone(visit.status)),
        ],
      ),
    );
  }
}
