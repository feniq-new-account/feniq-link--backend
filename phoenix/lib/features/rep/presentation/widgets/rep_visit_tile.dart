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

    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    final badge = StatusBadge(label: visitStatusLabel(l10n, visit.status), tone: visitStatusTone(visit.status));
    final details = <Widget>[
      if (showPharmacy && name.isNotEmpty) Text(name, style: context.textTheme.titleSmall),
      // The date and time wrap as whole words, never in the middle of a number
      // (design review 2026-11-18: "2026/1" over "0/27" at large text).
      Wrap(children: [for (final part in when.split(' ')) Text('$part ', style: muted)]),
      if (distance != null) Text(l10n.repDistanceMeters(distance), style: muted),
    ];
    // At large text the badge goes under the details instead of squeezing them.
    final large = MediaQuery.textScalerOf(context).scale(10) > 13;
    return CustomCard(
      padding: const EdgeInsets.all(AppSizes.spacingMedium),
      child: large
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [...details, const SizedBox(height: AppSizes.spacingXSmall), badge],
            )
          : Row(
              children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: details)),
                const SizedBox(width: AppSizes.spacingSmall),
                badge,
              ],
            ),
    );
  }
}
