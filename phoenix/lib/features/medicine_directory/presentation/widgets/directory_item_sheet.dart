import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/features/catalog/presentation/widgets/medicine_image.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';
import 'package:feniq/features/medicine_directory/presentation/widgets/directory_item_tile.dart';

/// One medicine in full - what it is, who makes it - and, under it, the other
/// medicines with the same active ingredient, strength and form: what a
/// pharmacist offers when this one is out of stock. All from the phone.
Future<void> showDirectoryItemSheet(
  BuildContext context, {
  required DirectoryItem item,
  required List<DirectoryItem> alternatives,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) => _DirectoryItemSheet(item: item, alternatives: alternatives),
  );
}

class _DirectoryItemSheet extends StatelessWidget {
  const _DirectoryItemSheet({required this.item, required this.alternatives});

  final DirectoryItem item;
  final List<DirectoryItem> alternatives;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: EdgeInsets.only(bottom: AppSizes.spacingLarge, left: AppPadding.screen.left, right: AppPadding.screen.right),
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: AppSizes.spacingMedium),
              decoration: BoxDecoration(color: Theme.of(context).dividerColor, borderRadius: AppRadius.full),
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: AppRadius.medium,
                child: MedicineImage(url: item.imageUrl, manufacturer: item.manufacturerAr, size: 84),
              ),
              const SizedBox(width: AppSizes.spacingMedium),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.nameAr, style: context.textTheme.titleMedium),
                    if (item.nameEn != null)
                      Text(
                        item.nameEn!,
                        style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                        textDirection: TextDirection.ltr,
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSizes.spacingMedium),
          _Fact(label: l10n.directoryCompanyLabel, value: item.manufacturerAr),
          if (item.activeIngredient != null) _Fact(label: l10n.directoryIngredientLabel, value: item.activeIngredient!),
          if (item.strength != null) _Fact(label: l10n.directoryStrengthLabel, value: item.strength!),
          if (item.dosageForm != null) _Fact(label: l10n.directoryFormLabel, value: item.dosageForm!),
          const SizedBox(height: AppSizes.spacingLarge),
          Text(l10n.directoryAlternativesTitle, style: context.textTheme.titleMedium),
          const SizedBox(height: 2),
          Text(
            l10n.directoryAlternativesSubtitle,
            style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
          ),
          const SizedBox(height: AppSizes.spacingSmall),
          if (alternatives.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSizes.spacingMedium),
              child: Text(l10n.directoryNoAlternatives, style: context.textTheme.bodyMedium),
            )
          else
            for (final alternative in alternatives) ...[
              DirectoryItemTile(item: alternative),
              Divider(height: 1, color: AppColors.borderOf(context)),
            ],
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context))),
          ),
          Expanded(child: Text(value, style: context.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
