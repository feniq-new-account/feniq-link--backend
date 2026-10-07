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
          Text(
            value,
            style: context.textTheme.titleLarge?.copyWith(
              color: AppColors.primaryOf(context),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSizes.spacingXSmall),
          Text(
            label,
            style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
          ),
        ],
      ),
    );
  }
}
