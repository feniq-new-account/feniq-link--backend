import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/add_to_cart_button.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/quantity_stepper.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_avatar.dart';
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
                child: _ProductImage(url: product.image, manufacturer: product.manufacturerAr, aspectRatio: 1.4),
              ),
              // Strength and dosage form each in their own corner, never
              // folded into the name.
              if (_hasText(product.strength))
                PositionedDirectional(
                  bottom: AppSizes.spacingXSmall,
                  start: AppSizes.spacingXSmall,
                  child: _CornerChip(label: product.strength!, emphasized: true),
                ),
              if (_hasText(product.dosageForm))
                PositionedDirectional(
                  bottom: AppSizes.spacingXSmall,
                  end: AppSizes.spacingXSmall,
                  child: _CornerChip(label: product.dosageForm!),
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
                _NameText(name: name),
                const SizedBox(height: 2),
                _ManufacturerText(manufacturer: manufacturer),
                _IngredientLine(product: product),
                _BatchDates(product: product),
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
    final meta = [
      if (_hasText(product.strength)) product.strength!,
      if (_hasText(product.dosageForm)) product.dosageForm!,
    ].join('  •  ');

    // Top: picture, then name / company / "strength • form", with the
    // availability (or offer) pill in the far corner. Under it the batch
    // dates, and a bottom bar with the price in its own rounded box and the
    // cart action beside it.
    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: AppRadius.medium,
                child: _ProductImage(url: product.image, manufacturer: product.manufacturerAr, size: 56),
              ),
              const SizedBox(width: AppSizes.spacingMedium),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.nameAr,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: context.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      product.manufacturerAr,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.textTheme.bodySmall?.copyWith(
                        color: AppColors.primaryOf(context),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (meta.isNotEmpty)
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                      ),
                    _IngredientLine(product: product),
                    _BatchDates(product: product),
                  ],
                ),
              ),
              const SizedBox(width: AppSizes.spacingSmall),
              if (!product.isAvailable)
                StatusBadge(label: l10n.unavailableLabel, tone: StatusBadgeTone.danger)
              else if (product.hasActiveOffer)
                StatusBadge(label: l10n.offerBadgeLabel, tone: StatusBadgeTone.pending)
              else
                StatusBadge(label: l10n.availableLabel, tone: StatusBadgeTone.info),
            ],
          ),
          const SizedBox(height: AppSizes.spacingSmall),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceOf(context),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: _PriceDisplay(product: product),
                ),
              ),
              const SizedBox(width: AppSizes.spacingSmall),
              if (product.isAvailable && cartQuantity > 0)
                QuantityStepper(
                  quantity: cartQuantity,
                  compact: true,
                  decrementTooltip: l10n.decreaseQuantityLabel,
                  incrementTooltip: l10n.increaseQuantityLabel,
                  onChanged: onCartQuantityChanged ?? (_) {},
                  onBelowMin: onCartRemove,
                )
              else if (product.isAvailable)
                AddToCartButton(available: true, onTap: onAddTap, compact: true),
            ],
          ),
          _AlternativesLink(product: product, onTap: onShowAlternatives),
        ],
      ),
    );
  }
}

// "PARACETAMOL" under the company - what the medicine is made of (its
// strength has its own chip). Nothing when the catalog item has no ingredient.
class _IngredientLine extends StatelessWidget {
  const _IngredientLine({required this.product});

  final ProductModel product;

  @override
  Widget build(BuildContext context) {
    final ingredient = product.activeIngredient;
    if (ingredient == null || ingredient.isEmpty) return const SizedBox.shrink();
    final text = ingredient;
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
          _bonusOnOffer(product)
              ? context.l10n.bonusInsteadOf(BonusTier.format(product.bonuses), BonusTier.format(product.regularBonuses))
              : context.l10n.bonusValue(BonusTier.format(product.bonuses)),
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
          fontSize: 14,
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
            fontSize: 14,
          ),
        ),
      ],
    );
  }
}

class _ProductImage extends StatelessWidget {
  const _ProductImage({required this.url, required this.manufacturer, this.aspectRatio, this.size});

  final String? url;
  // Whose medicine it is: stands in for the picture when there is none.
  final String manufacturer;
  final double? aspectRatio;
  final double? size;

  @override
  Widget build(BuildContext context) {
    // `product.image` is the effective image the server resolves (the
    // warehouse's override, else the catalog's central one - catalog overhaul
    // Phase 9), always on Cloudinary or the server's own disk; AppNetworkImage
    // right-sizes and caches it. A medicine with no picture shows its company's
    // coloured initial (the same one the company list uses) rather than a blank
    // box, so a catalog that is only partly photographed still looks finished.
    final image = AppNetworkImage(
      url: url,
      fit: BoxFit.cover,
      width: size,
      height: size,
      fallback: _CompanyTile(name: manufacturer, size: size),
    );

    if (size != null) {
      return SizedBox(width: size, height: size, child: image);
    }
    return AspectRatio(aspectRatio: aspectRatio!, child: image);
  }
}

class _CompanyTile extends StatelessWidget {
  const _CompanyTile({required this.name, this.size});

  final String name;
  final double? size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      color: AppColors.surfaceOf(context),
      alignment: Alignment.center,
      child: name.trim().isEmpty
          ? Icon(Icons.medication_outlined, color: AppColors.textSecondaryOf(context))
          : ManufacturerAvatar(name: name),
    );
  }
}

bool _hasText(String? value) => value != null && value.trim().isNotEmpty;

// The medicine's name: kept compact so a card shows the name, company,
// strength, form and dates without scrolling.
class _NameText extends StatelessWidget {
  const _NameText({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Text(
      name,
      style: context.textTheme.bodyMedium?.copyWith(fontSize: 13, fontWeight: FontWeight.w700, height: 1.25),
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
    );
  }
}

class _ManufacturerText extends StatelessWidget {
  const _ManufacturerText({required this.manufacturer});

  final String manufacturer;

  @override
  Widget build(BuildContext context) {
    return Text(
      manufacturer,
      style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context), fontSize: 11),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}

// A small label for the strength ("500 MG") or the dosage form ("أقراص").
class _CornerChip extends StatelessWidget {
  const _CornerChip({required this.label, this.emphasized = false});

  final String label;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final color = emphasized ? AppColors.navyOf(context) : AppColors.surfaceElevatedOf(context);
    final textColor = emphasized ? Colors.white : AppColors.textOf(context);
    return Container(
      constraints: const BoxConstraints(maxWidth: 110),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(6),
        border: emphasized ? null : Border.all(color: AppColors.borderOf(context)),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textDirection: _isLatin(label) ? TextDirection.ltr : null,
        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: textColor, height: 1.2),
      ),
    );
  }

  static bool _isLatin(String text) => RegExp(r'^[\x00-\x7F]+$').hasMatch(text);
}

// "إنتاج 03/2026 · انتهاء 03/2028" - the batch on sale, when the warehouse
// gave it. An expiry less than six months away is shown in the warning colour.
class _BatchDates extends StatelessWidget {
  const _BatchDates({required this.product});

  final ProductModel product;

  static String _format(DateTime date) => '${date.month.toString().padLeft(2, '0')}/${date.year}';

  @override
  Widget build(BuildContext context) {
    final produced = product.productionDate;
    final expires = product.expiryDate;
    if (produced == null && expires == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    final base = context.textTheme.bodySmall?.copyWith(fontSize: 10.5, color: AppColors.textSecondaryOf(context));
    final expiresSoon = expires != null && expires.isBefore(DateTime.now().add(const Duration(days: 183)));
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Text.rich(
        TextSpan(
          children: [
            if (produced != null) TextSpan(text: l10n.productionDateShort(_format(produced))),
            if (produced != null && expires != null) const TextSpan(text: '  ·  '),
            if (expires != null)
              TextSpan(
                text: l10n.expiryDateShort(_format(expires)),
                style: expiresSoon
                    ? TextStyle(color: AppColors.warningOf(context), fontWeight: FontWeight.w700)
                    : null,
              ),
          ],
        ),
        style: base,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

// A bonus offer is running: the bonus in force is not the product's usual one.
bool _bonusOnOffer(ProductModel product) =>
    product.regularBonuses.isNotEmpty && BonusTier.format(product.regularBonuses) != BonusTier.format(product.bonuses);
