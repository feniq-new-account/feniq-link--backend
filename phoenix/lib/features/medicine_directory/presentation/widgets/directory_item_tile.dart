import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/features/catalog/presentation/widgets/medicine_image.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';

/// One row of the medicine directory: picture (or the company's initial), name,
/// company, and what it is made of. Deliberately flat - thousands of these are
/// scrolled, so no shadows or cards.
class DirectoryItemTile extends StatelessWidget {
  const DirectoryItemTile({super.key, required this.item, this.onTap});

  final DirectoryItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final secondary = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            ClipRRect(
              borderRadius: AppRadius.small,
              child: MedicineImage(url: item.imageUrl, manufacturer: item.manufacturerAr, size: 52),
            ),
            const SizedBox(width: AppSizes.spacingMedium),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.nameAr, style: context.textTheme.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(item.manufacturerAr, style: secondary, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (item.hasDetails)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        item.detailsLine,
                        style: secondary?.copyWith(fontSize: 11.5),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: AppColors.textSecondaryOf(context), size: 20),
          ],
        ),
      ),
    );
  }
}
