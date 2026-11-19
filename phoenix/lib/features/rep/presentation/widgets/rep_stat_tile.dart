import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/custom_card.dart';

/// One number with its label - the rep's headline figures.
class RepStatTile extends StatelessWidget {
  const RepStatTile({super.key, required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return CustomCard(
      padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: AppSizes.spacingMedium),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // A long amount shrinks to one line instead of wrapping its currency.
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              value,
              maxLines: 1,
              style: context.textTheme.titleLarge?.copyWith(
                color: AppColors.primaryTextOf(context),
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(height: AppSizes.spacingXSmall),
          Text(label, style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context))),
        ],
      ),
    );
  }
}

/// The same figures on one card, value then label, wrapping as needed - used
/// at large text sizes where three tiles would push the list off screen.
class RepStatsLine extends StatelessWidget {
  const RepStatsLine({super.key, required this.entries});

  final List<(String, String)> entries;

  @override
  Widget build(BuildContext context) {
    final valueStyle = context.textTheme.titleMedium?.copyWith(
      color: AppColors.primaryTextOf(context),
      fontWeight: FontWeight.w800,
    );
    final labelStyle = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    return CustomCard(
      padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: AppSizes.spacingSmall),
      child: Wrap(
        spacing: AppSizes.spacingMedium,
        runSpacing: AppSizes.spacingXSmall,
        children: [
          for (final (value, label) in entries)
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: value, style: valueStyle),
                  const TextSpan(text: ' '),
                  TextSpan(text: label, style: labelStyle),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
