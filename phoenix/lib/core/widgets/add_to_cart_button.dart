import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/full_text.dart';

/// The app's one "put this in the cart" button.
///
/// Lifted verbatim out of ProductCard (where it was private) when a second
/// screen - the warehouse's offers list - grew the same action, so the two
/// could not drift into two subtly different add buttons. Nothing about it
/// changed in the move; the catalog renders exactly what it rendered before.
///
/// [compact] is the list-row shape: a labelled pill about as wide as the
/// QuantityStepper that takes its slot once the product is in the cart. The
/// default is the grid-tile shape: a full-width icon + label button.
/// [iconOnly] is a square cart button for a card corner, labelled for screen
/// readers and on long-press.
class AddToCartButton extends StatelessWidget {
  const AddToCartButton({
    super.key,
    required this.available,
    required this.onTap,
    this.compact = false,
    this.iconOnly = false,
  });

  final bool available;
  final VoidCallback onTap;
  final bool compact;
  final bool iconOnly;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final style = FilledButton.styleFrom(
      backgroundColor: AppColors.primaryOf(context).withValues(alpha: 0.12),
      foregroundColor: AppColors.primaryOf(context),
      disabledBackgroundColor: AppColors.borderOf(context),
      shape: const RoundedRectangleBorder(borderRadius: AppRadius.small),
      padding: compact
          ? const EdgeInsets.symmetric(horizontal: AppSizes.spacingSmall + AppSizes.spacingXSmall)
          : const EdgeInsets.symmetric(vertical: 8),
      elevation: 0,
    );

    if (iconOnly) {
      return Tooltip(
        message: l10n.addToCartFullButton,
        child: SizedBox.square(
          dimension: 38,
          child: FilledButton(
            onPressed: available ? onTap : null,
            style: style.copyWith(padding: const WidgetStatePropertyAll(EdgeInsets.zero)),
            child: Semantics(
              label: l10n.addToCartFullButton,
              child: const Icon(Icons.add_shopping_cart_outlined, size: 18),
            ),
          ),
        ),
      );
    }

    // The list row's button used to be a bare "+" icon. It now says what it
    // does - the same button, callback and tinted style, only a labelled pill
    // in place of the circle, about as wide as the in-cart stepper that takes
    // its slot once the product is added.
    if (compact) {
      return SizedBox(
        height: 40,
        child: FilledButton(
          onPressed: available ? onTap : null,
          style: style,
          // Shrinks rather than clips when a narrow row squeezes it.
          child: FitLabel(
            l10n.addToCartFullButton,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: available ? onTap : null,
        icon: const Icon(Icons.add_shopping_cart_outlined, size: 16),
        label: Text(l10n.addToCartButton, style: const TextStyle(fontSize: 12)),
        style: style,
      ),
    );
  }
}
