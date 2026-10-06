import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/advertisements/data/models/advertisement_model.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';

/// One medicine inside a package, as the package screens show it: name,
/// company, strength and form, and how many units the package holds.
class PackageContentEntry {
  const PackageContentEntry({
    required this.name,
    required this.quantity,
    this.manufacturer,
    this.strength,
    this.dosageForm,
    this.image,
  });

  /// From a package as the offers / warehouse screens list it.
  factory PackageContentEntry.fromItem(AdvertisementItemModel item) => PackageContentEntry(
    name: item.displayName,
    quantity: item.quantity,
    manufacturer: item.displayManufacturer,
    strength: item.strength,
    dosageForm: item.dosageForm,
    image: item.image,
  );

  /// From a package line in the cart, at its copy count.
  factory PackageContentEntry.fromCart(CartPackageContent content, {int copies = 1}) => PackageContentEntry(
    name: content.displayName,
    quantity: content.quantityPerCopy * copies,
    manufacturer: content.displayManufacturer,
    strength: content.strength,
    dosageForm: content.dosageForm,
    image: content.image,
  );

  final String name;
  final int quantity;
  final String? manufacturer;
  final String? strength;
  final String? dosageForm;
  final String? image;
}

bool _has(String? value) => value != null && value.trim().isNotEmpty;

/// One medicine of a package, in full - nothing about it is cut off.
class PackageContentRow extends StatelessWidget {
  const PackageContentRow({super.key, required this.entry, this.showImage = true});

  final PackageContentEntry entry;
  final bool showImage;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final secondary = AppColors.textSecondaryOf(context);
    final meta = [
      if (_has(entry.strength)) ltrIsolate(entry.strength!),
      if (_has(entry.dosageForm)) entry.dosageForm!,
    ].join('  •  ');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showImage) ...[
          ClipRRect(
            borderRadius: AppRadius.small,
            child: AppNetworkImage(
              url: entry.image,
              width: 44,
              height: 44,
              fit: BoxFit.contain,
              fallbackIcon: Icons.medication_outlined,
            ),
          ),
          const SizedBox(width: AppSizes.spacingSmall),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(entry.name, style: context.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
              if (_has(entry.manufacturer))
                Text(entry.manufacturer!, style: context.textTheme.bodySmall?.copyWith(color: secondary)),
              if (meta.isNotEmpty) Text(meta, style: context.textTheme.bodySmall?.copyWith(color: secondary)),
            ],
          ),
        ),
        const SizedBox(width: AppSizes.spacingSmall),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            color: AppColors.surfaceOf(context),
            borderRadius: AppRadius.full,
            border: Border.all(color: AppColors.borderOf(context)),
          ),
          child: Text(
            l10n.advertisementItemQuantity(entry.quantity),
            style: context.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}

/// Opens the full list of what a package holds, before (or after) it goes
/// into the cart. [onAdd], when given, is the "add the package to the cart"
/// action at the bottom; without it the sheet is read-only (a package already
/// in the cart). The package is fixed - the sheet says so - and can only be
/// taken whole, in copies.
Future<void> showPackageContentsSheet(
  BuildContext context, {
  required String title,
  required List<PackageContentEntry> entries,
  String? subtitle,
  Widget? price,
  VoidCallback? onAdd,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (sheetContext) {
      final l10n = sheetContext.l10n;
      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, controller) => SafeArea(
          top: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSizes.spacingMedium, 0, AppSizes.spacingMedium, AppSizes.spacingSmall),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    if (_has(subtitle))
                      Text(subtitle!, style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context))),
                    const SizedBox(height: AppSizes.spacingSmall),
                    Text(l10n.packageContentsTitle, style: context.textTheme.titleSmall),
                    const SizedBox(height: 2),
                    Text(
                      l10n.packageFixedNote,
                      style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  controller: controller,
                  padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: AppSizes.spacingSmall),
                  itemCount: entries.length,
                  separatorBuilder: (_, __) => Divider(height: AppSizes.spacingMedium, color: AppColors.borderOf(context)),
                  itemBuilder: (context, index) => PackageContentRow(entry: entries[index]),
                ),
              ),
              if (price != null || onAdd != null)
                Padding(
                  padding: const EdgeInsets.all(AppSizes.spacingMedium),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ?price,
                      if (price != null && onAdd != null) const SizedBox(height: AppSizes.spacingSmall),
                      if (onAdd != null)
                        PrimaryButton(
                          label: l10n.packageAddToCart,
                          onPressed: () {
                            Navigator.of(sheetContext).pop();
                            onAdd();
                          },
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}
