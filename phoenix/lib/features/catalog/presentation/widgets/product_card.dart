import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/widgets/name_text.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/add_to_cart_button.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/medicine_placeholder.dart';
import 'package:feniq/core/widgets/quantity_stepper.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/presentation/widgets/quantity_picker_sheet.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/core/widgets/offer_badge.dart';

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
    this.showManufacturer = true,
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
  // Hidden inside a selected manufacturer's catalog; retained in cross-company search.
  final bool showManufacturer;

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
              showManufacturer: showManufacturer,
            )
          : _ListRow(
              product: product,
              cartQuantity: cartQuantity,
              onAddTap: () => _handleAddTap(context),
              onCartQuantityChanged: onCartQuantityChanged,
              onCartRemove: onCartRemove,
              onShowAlternatives: onShowAlternatives,
              showManufacturer: showManufacturer,
            ),
    );
  }
}

// Grid tile. The picture on top, with the dosage form and strength stacked in
// its top-left corner and the offer (or "unavailable") badge in the other;
// under it the name, company, ingredient and batch dates; and at the bottom
// the prices in one corner and the cart button in the other.
class _GridCard extends StatelessWidget {
  const _GridCard({
    required this.product,
    required this.cartQuantity,
    required this.onAddTap,
    required this.onCartQuantityChanged,
    required this.onCartRemove,
    required this.onShowAlternatives,
    required this.showManufacturer,
  });

  final ProductModel product;
  final int cartQuantity;
  final VoidCallback onAddTap;
  final ValueChanged<int>? onCartQuantityChanged;
  final VoidCallback? onCartRemove;
  final VoidCallback? onShowAlternatives;
  final bool showManufacturer;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final inCart = product.isAvailable && cartQuantity > 0;

    return CustomCard(
      padding: EdgeInsets.zero,
      // An exceptional offer is framed in the badge's red.
      borderColor: _onOffer(product) ? OfferBadge.frameColor(context) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.vertical(top: AppRadius.large.topLeft),
                child: _ProductImage(url: product.image, dosageForm: product.dosageForm, aspectRatio: 1.6),
              ),
              PositionedDirectional(
                top: AppSizes.spacingXSmall + 2,
                end: AppSizes.spacingXSmall + 2,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 104),
                  child: _FormAndStrength(product: product),
                ),
              ),
              if (!product.isAvailable)
                PositionedDirectional(
                  bottom: AppSizes.spacingXSmall + 2,
                  start: AppSizes.spacingXSmall + 2,
                  child: StatusBadge(label: l10n.unavailableLabel, tone: StatusBadgeTone.danger),
                )
              else if (product.hasActiveOffer)
                const PositionedDirectional(
                  bottom: AppSizes.spacingXSmall + 2,
                  start: AppSizes.spacingXSmall + 2,
                  child: OfferBadge(compact: true),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _NameText(name: product.displayName, fontSize: 14),
                if (showManufacturer) ...[
                  const SizedBox(height: 2),
                  _ManufacturerText(manufacturer: product.displayManufacturer),
                ],
                _IngredientLine(product: product),
                _BatchDates(product: product),
                const SizedBox(height: AppSizes.spacingSmall),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(child: _PriceDisplay(product: product)),
                    if (product.isAvailable && !inCart) ...[
                      const SizedBox(width: AppSizes.spacingXSmall),
                      AddToCartButton(available: true, onTap: onAddTap, iconOnly: true),
                    ],
                  ],
                ),
                _AlternativesLink(product: product, onTap: onShowAlternatives),
                if (inCart) ...[
                  const SizedBox(height: AppSizes.spacingXSmall),
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
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// List row - the catalog's default. Every corner carries something:
//   top-right    the picture
//   middle       name, company, ingredient, batch dates
//   top-left     dosage form, its strength under it, and "البدائل"
//   bottom-right the prices (before / after the discount, bonus)
//   bottom-left  the cart action - or "غير متوفر" when it can't be ordered
// An available product carries no availability label at all: being listed
// means it is in stock.
class _ListRow extends StatelessWidget {
  const _ListRow({
    required this.product,
    required this.cartQuantity,
    required this.onAddTap,
    required this.onCartQuantityChanged,
    required this.onCartRemove,
    required this.onShowAlternatives,
    required this.showManufacturer,
  });

  final ProductModel product;
  final int cartQuantity;
  final VoidCallback onAddTap;
  final ValueChanged<int>? onCartQuantityChanged;
  final VoidCallback? onCartRemove;
  final VoidCallback? onShowAlternatives;
  final bool showManufacturer;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final Widget action;
    if (!product.isAvailable) {
      action = StatusBadge(label: l10n.unavailableLabel, tone: StatusBadgeTone.danger);
    } else if (cartQuantity > 0) {
      action = QuantityStepper(
        quantity: cartQuantity,
        compact: true,
        decrementTooltip: l10n.decreaseQuantityLabel,
        incrementTooltip: l10n.increaseQuantityLabel,
        onChanged: onCartQuantityChanged ?? (_) {},
        onBelowMin: onCartRemove,
      );
    } else {
      action = AddToCartButton(available: true, onTap: onAddTap, compact: true);
    }

    return CustomCard(
      padding: const EdgeInsets.all(12),
      borderColor: _onOffer(product) ? OfferBadge.frameColor(context) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: AppRadius.medium,
                child: _ProductImage(
                  url: product.image,
                  dosageForm: product.dosageForm,
                  size: 68,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // The medicine title gets the full remaining card width.
                    // Never truncate a medicine name: dose/form can be critical.
                    _NameText(name: product.displayName, fontSize: 16),
                    if (showManufacturer) ...[
                      const SizedBox(height: 2),
                      _ManufacturerText(
                        manufacturer: product.displayManufacturer,
                        emphasized: true,
                      ),
                    ],
                    _IngredientLine(product: product),
                    _BatchDates(product: product),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (_hasText(product.dosageForm))
                      _CornerChip(label: product.dosageForm!),
                    if (_hasText(product.strength))
                      _CornerChip(label: product.strength!, emphasized: true),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _AlternativesLink(product: product, onTap: onShowAlternatives),
                  if (_onOffer(product))
                    const OfferBadge(compact: true),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: _PriceDisplay(product: product)),
              const SizedBox(width: AppSizes.spacingSmall),
              // Never more than half the row: the price keeps the other half.
              Flexible(child: action),
            ],
          ),
        ],
      ),
    );
  }
}

// The dosage form ("أقراص مغلفة") with its strength ("875 MG/125 MG") under
// it, both right-aligned to the card's corner. Nothing when neither is known.
class _FormAndStrength extends StatelessWidget {
  const _FormAndStrength({required this.product});

  final ProductModel product;

  @override
  Widget build(BuildContext context) {
    final hasForm = _hasText(product.dosageForm);
    final hasStrength = _hasText(product.strength);
    if (!hasForm && !hasStrength) return const SizedBox.shrink();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (hasForm) _CornerChip(label: product.dosageForm!),
        if (hasForm && hasStrength) const SizedBox(height: 3),
        if (hasStrength) _CornerChip(label: product.strength!, emphasized: true),
      ],
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
      child: NameText(
        text,
        style: context.textTheme.bodySmall?.copyWith(
          color: AppColors.textSecondaryOf(context),
          fontSize: 11,
          letterSpacing: 0.1,
          height: 1.3,
        ),
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
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.swap_horiz_rounded, size: 14, color: AppColors.primaryOf(context)),
            const SizedBox(width: 3),
            Text(
              context.l10n.alternativesLink,
              style: context.textTheme.bodySmall?.copyWith(
                color: AppColors.primaryOf(context),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PriceDisplay extends StatelessWidget {
  const _PriceDisplay({required this.product, this.showOfferBadge = false});

  final ProductModel product;
  // The list row has no picture corner to badge, so its offer badge sits on
  // the price's first line, beside the price before the discount.
  final bool showOfferBadge;

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
        const SizedBox(height: 3),
        Text(
          _bonusOnOffer(product)
              ? context.l10n.bonusInsteadOf(BonusTier.format(product.bonuses), BonusTier.format(product.regularBonuses))
              : context.l10n.bonusValue(BonusTier.format(product.bonuses)),
          style: context.textTheme.bodySmall?.copyWith(
            color: AppColors.secondaryOf(context),
            fontWeight: FontWeight.w600,
            fontSize: 12,
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
    final badge = showOfferBadge && _onOffer(product);

    final current = Text(
      formatMoneySyp(product.finalSypAt(usdToSyp), l10n.currencySuffix),
      style: TextStyle(
        color: hasDiscount ? AppColors.secondaryOf(context) : AppColors.primaryOf(context),
        fontWeight: FontWeight.w700,
        fontSize: 15,
        height: 1.2,
      ),
    );
    if (!hasDiscount && !badge) return current;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppSizes.spacingSmall,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (hasDiscount)
              Text(
                formatMoneySyp(product.unitSypAt(usdToSyp), l10n.currencySuffix),
                style: TextStyle(
                  decoration: TextDecoration.lineThrough,
                  color: AppColors.textSecondaryOf(context),
                  fontSize: 12,
                ),
              ),
            if (badge) const OfferBadge(compact: true),
          ],
        ),
        const SizedBox(height: 3),
        current,
      ],
    );
  }
}

class _ProductImage extends StatelessWidget {
  const _ProductImage({required this.url, this.dosageForm, this.aspectRatio, this.size});

  final String? url;
  // Picks the drawing that stands in for a missing picture (see MedicinePlaceholder).
  final String? dosageForm;
  final double? aspectRatio;
  final double? size;

  @override
  Widget build(BuildContext context) {
    // `product.image` is the effective image the server resolves (the
    // warehouse's override, else the catalog's central one - catalog overhaul
    // Phase 9), always on Cloudinary or the server's own disk; AppNetworkImage
    // right-sizes and caches it. A medicine with no picture shows a drawing of
    // its dosage form (never a company's initial, which read as a mistake)
    // rather than a blank box, so a catalog that is only partly photographed still looks
    // finished.
    //
    // Every picture sits in the same white tile with the same margin, trimmed
    // and fitted (never cropped) by Cloudinary to exactly that size, so all
    // medicines look the same size whatever their original photo was.
    final hasImage = url != null && url!.trim().isNotEmpty;
    final image = hasImage
        ? ColoredBox(
            color: Colors.white,
            child: Padding(
              padding: EdgeInsets.all(size == null ? AppSizes.spacingSmall : 4),
              child: AppNetworkImage(
                url: url,
                fit: BoxFit.contain,
                framed: true,
                fallback: MedicinePlaceholder(dosageForm: dosageForm),
              ),
            ),
          )
        : MedicinePlaceholder(dosageForm: dosageForm);

    if (size != null) {
      return SizedBox(width: size, height: size, child: image);
    }
    return AspectRatio(aspectRatio: aspectRatio!, child: image);
  }
}

bool _hasText(String? value) => value != null && value.trim().isNotEmpty;

// The medicine's name, always in full (it wraps; it is never cut off): a
// health app must never show half a medicine name.
class _NameText extends StatelessWidget {
  const _NameText({required this.name, this.fontSize = 13});

  final String name;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return NameText(
      name,
      style: context.textTheme.bodyMedium?.copyWith(fontSize: fontSize, fontWeight: FontWeight.w700, height: 1.25),
    );
  }
}

class _ManufacturerText extends StatelessWidget {
  const _ManufacturerText({required this.manufacturer, this.emphasized = false});

  final String manufacturer;
  // The list row shows the company in the brand colour.
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return NameText(
      manufacturer,
      style: context.textTheme.bodySmall?.copyWith(
        color: emphasized ? AppColors.primaryOf(context) : AppColors.textSecondaryOf(context),
        fontWeight: emphasized ? FontWeight.w600 : null,
        fontSize: 12,
      ),
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
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(6),
        border: emphasized ? null : Border.all(color: AppColors.borderOf(context)),
      ),
      child: Text(
        label,
        textDirection: _isLatin(label) ? TextDirection.ltr : null,
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: textColor, height: 1.25),
      ),
    );
  }

  static bool _isLatin(String text) => RegExp(r'^[\x00-\x7F]+$').hasMatch(text);
}

// Expiry is the batch detail needed when ordering. Production remains in the
// data model, without adding clutter to the card.
class _BatchDates extends StatelessWidget {
  const _BatchDates({required this.product});

  final ProductModel product;

  static String _format(DateTime date) => '${date.month.toString().padLeft(2, '0')}/${date.year}';

  @override
  Widget build(BuildContext context) {
    final expires = product.expiryDate;
    if (expires == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    final base = context.textTheme.bodySmall?.copyWith(fontSize: 12, color: AppColors.textSecondaryOf(context));
    final expiresSoon = expires.isBefore(DateTime.now().add(const Duration(days: 183)));
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Wrap(
        spacing: AppSizes.spacingSmall,
        runSpacing: 1,
        children: [
          Text(
            l10n.expiryDateShort(_format(expires)),
            style: expiresSoon
                ? base?.copyWith(color: AppColors.warningOf(context), fontWeight: FontWeight.w700)
                : base,
          ),
        ],
      ),
    );
  }
}

// A bonus offer is running: the bonus in force is not the product's usual one.
bool _bonusOnOffer(ProductModel product) =>
    product.regularBonuses.isNotEmpty && BonusTier.format(product.regularBonuses) != BonusTier.format(product.bonuses);

// On an exceptional offer the pharmacist can still buy: framed and badged in red.
bool _onOffer(ProductModel product) => product.isAvailable && product.hasActiveOffer;
