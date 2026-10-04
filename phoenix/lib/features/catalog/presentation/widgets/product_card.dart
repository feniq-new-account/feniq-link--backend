import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/add_to_cart_button.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/quantity_stepper.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/medicine_image.dart';
import 'package:feniq/features/catalog/presentation/widgets/quantity_picker_sheet.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';

// Two layouts sharing the same data/logic: a grid tile (image on top,
// details below - the default) and a compact list row, toggled from
// CatalogView. Both keep the exact same rules: unavailable products stay
// visible but faded (never hidden). When the product isn't in the cart yet the
// "add" action goes through the quantity picker sheet; once it's in the cart
// the same slot shows a [QuantityStepper] wired straight to the cart
// ([cartQuantity] + [onCartQuantityChanged] / [onCartRemove], supplied by
// CatalogView).
class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.product,
    required this.onAdd,
    this.cartQuantity = 0,
    this.onCartQuantityChanged,
    this.onCartRemove,
    this.onShowAlternatives,
    this.isGrid = true,
  });

  final ProductModel product;
  final ValueChanged<int> onAdd;

  // Quantity of this product currently in the cart (0 when it isn't). > 0
  // swaps the "Add" button for a live stepper: [onCartQuantityChanged] carries
  // a typed or stepped value, [onCartRemove] fires when it's taken below 1.
  final int cartQuantity;
  final ValueChanged<int>? onCartQuantityChanged;
  final VoidCallback? onCartRemove;
  // Opens the alternatives (same ingredient, strength and form). Only offered when
  // the product has an active ingredient, since that is what the match is on.
  final VoidCallback? onShowAlternatives;
  final bool isGrid;

  Future<void> _handleAddTap(BuildContext context) async {
    final quantity = await showQuantityPickerSheet(context);
    if (quantity != null) {
      onAdd(quantity);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: product.isAvailable ? 1.0 : 0.55,
      child: isGrid
          ? _GridCard(
              product: product,
              cartQuantity: cartQuantity,
              onAddTap: () => _handleAddTap(context),
              onCartQuantityChanged: onCartQuantityChanged,
              onCartRemove: onCartRemove,
              onShowAlternatives: onShowAlternatives,
            )
          : _ListRow(
              product: product,
              cartQuantity: cartQuantity,
              onAddTap: () => _handleAddTap(context),
              onCartQuantityChanged: onCartQuantityChanged,
              onCartRemove: onCartRemove,
              onShowAlternatives: onShowAlternatives,
            ),
    );
  }
}

class _GridCard extends StatelessWidget {
  const _GridCard({
    required this.product,
    required this.cartQuantity,
    required this.onAddTap,
    required this.onCartQuantityChanged,
    required this.onCartRemove,
    required this.onShowAlternatives,
  });

  final ProductModel product;
  final int cartQuantity;
  final VoidCallback onAddTap;
  final ValueChanged<int>? onCartQuantityChanged;
  final VoidCallback? onCartRemove;
  final VoidCallback? onShowAlternatives;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final name = product.nameAr;
    final manufacturer = product.manufacturerAr;

    return CustomCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.vertical(top: AppRadius.large.topLeft),
                child: MedicineImage(url: product.image, manufacturer: product.manufacturerAr, aspectRatio: 1.25),
              ),
              if (!product.isAvailable)
                PositionedDirectional(
                  top: AppSizes.spacingSmall,
                  end: AppSizes.spacingSmall,
                  child: StatusBadge(label: l10n.unavailableLabel, tone: StatusBadgeTone.danger),
                )
              else if (product.hasActiveOffer)
                PositionedDirectional(
                  top: AppSizes.spacingSmall,
                  end: AppSizes.spacingSmall,
                  child: StatusBadge(label: l10n.offerBadgeLabel, tone: StatusBadgeTone.pending),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(AppSizes.spacingSmall),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: context.textTheme.titleSmall,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  manufacturer,
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                _IngredientLine(product: product),
                const SizedBox(height: AppSizes.spacingXSmall),
                _PriceDisplay(product: product),
                _AlternativesLink(product: product, onTap: onShowAlternatives),
                const SizedBox(height: AppSizes.spacingSmall),
                if (product.isAvailable && cartQuantity > 0)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: QuantityStepper(
                      quantity: cartQuantity,
                      compact: true,
                      decrementTooltip: l10n.decreaseQuantityLabel,
                      incrementTooltip: l10n.increaseQuantityLabel,
                      onChanged: onCartQuantityChanged ?? (_) {},
                      onBelowMin: onCartRemove,
                    ),
                  )
                else
                  AddToCartButton(available: product.isAvailable, onTap: onAddTap),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ListRow extends StatelessWidget {
  const _ListRow({
    required this.product,
    required this.cartQuantity,
    required this.onAddTap,
    required this.onCartQuantityChanged,
    required this.onCartRemove,
    required this.onShowAlternatives,
  });

  final ProductModel product;
  final int cartQuantity;
  final VoidCallback onAddTap;
  final ValueChanged<int>? onCartQuantityChanged;
  final VoidCallback? onCartRemove;
  final VoidCallback? onShowAlternatives;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final name = product.nameAr;
    final manufacturer = product.manufacturerAr;

    return CustomCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ClipRRect(
            borderRadius: AppRadius.small,
            child: MedicineImage(url: product.image, manufacturer: product.manufacturerAr, size: 56),
          ),
          const SizedBox(width: AppSizes.spacingMedium),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: context.textTheme.titleSmall,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  manufacturer,
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                _IngredientLine(product: product),
                const SizedBox(height: AppSizes.spacingXSmall),
                _PriceDisplay(product: product),
                _AlternativesLink(product: product, onTap: onShowAlternatives),
              ],
            ),
          ),
          const SizedBox(width: AppSizes.spacingSmall),
          if (!product.isAvailable)
            StatusBadge(label: l10n.unavailableLabel, tone: StatusBadgeTone.danger)
          else if (cartQuantity > 0)
            QuantityStepper(
              quantity: cartQuantity,
              compact: true,
              decrementTooltip: l10n.decreaseQuantityLabel,
              incrementTooltip: l10n.increaseQuantityLabel,
              onChanged: onCartQuantityChanged ?? (_) {},
              onBelowMin: onCartRemove,
            )
          else
            AddToCartButton(available: true, onTap: onAddTap, compact: true),
        ],
      ),
    );
  }
}

// "PARACETAMOL · 500 MG/TAB." under the company - what the medicine is made of
// and how strong. Nothing when the catalog item has no ingredient.
class _IngredientLine extends StatelessWidget {
  const _IngredientLine({required this.product});

  final ProductModel product;

  @override
  Widget build(BuildContext context) {
    final ingredient = product.activeIngredient;
    if (ingredient == null || ingredient.isEmpty) return const SizedBox.shrink();
    final strength = product.strength;
    final text = strength == null || strength.isEmpty ? ingredient : '$ingredient · $strength';
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Text(
        text,
        style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context), fontSize: 11.5),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

// "البدائل" - opens the other medicines with the same ingredient, strength and form.
class _AlternativesLink extends StatelessWidget {
  const _AlternativesLink({required this.product, required this.onTap});

  final ProductModel product;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ingredient = product.activeIngredient;
    if (onTap == null || ingredient == null || ingredient.isEmpty) return const SizedBox.shrink();
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.small,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Text(
          context.l10n.alternativesLink,
          style: context.textTheme.bodySmall?.copyWith(
            color: AppColors.primaryOf(context),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _PriceDisplay extends StatelessWidget {
  const _PriceDisplay({required this.product});

  final ProductModel product;

  // The price, and under it the warehouse's bonus when the product has one
  // ("بونص 10+1", catalog overhaul Phase 8).
  @override
  Widget build(BuildContext context) {
    final price = _buildPrice(context);
    if (product.bonuses.isEmpty) return price;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        price,
        const SizedBox(height: 2),
        Text(
          context.l10n.bonusValue(BonusTier.format(product.bonuses)),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: context.textTheme.bodySmall?.copyWith(
            color: AppColors.secondaryOf(context),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildPrice(BuildContext context) {
    final l10n = context.l10n;
    // Purely visual: whenever the server-computed discounted price comes in
    // below the list price (discountPriceUsd already has any active Offer AND
    // the warehouse's manufacturer discount stacked in - see
    // product.viewmodel.js), show the list price struck through above the
    // discounted one. Equal prices -> a single plain number. The card only
    // shows the figures, never why a price is lower.
    //
    // SYP is the only figure shown - the lira price the order will charge,
    // as the server computed it (ProductModel.finalSypAt, catalog overhaul
    // Phase 7), never a local conversion of the USD figure.
    final usdToSyp = context.watch<ExchangeRateCubit>().state.usdToSyp;
    final hasDiscount = product.discountPriceUsd < product.priceUsd;

    if (!hasDiscount) {
      return Text(
        formatMoneySyp(product.finalSypAt(usdToSyp), l10n.currencySuffix),
        style: context.textTheme.titleSmall?.copyWith(
          color: AppColors.primaryOf(context),
          fontSize: 15,
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          formatMoneySyp(product.unitSypAt(usdToSyp), l10n.currencySuffix),
          style: TextStyle(
            decoration: TextDecoration.lineThrough,
            color: AppColors.textSecondaryOf(context),
            fontSize: 11.5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          formatMoneySyp(product.finalSypAt(usdToSyp), l10n.currencySuffix),
          style: TextStyle(
            color: AppColors.secondaryOf(context),
            fontWeight: FontWeight.bold,
            fontSize: 15,
          ),
        ),
      ],
    );
  }
}
