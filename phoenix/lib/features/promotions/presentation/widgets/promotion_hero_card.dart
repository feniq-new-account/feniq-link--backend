import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/features/promotions/data/models/promotion.dart';

import 'promotion_card_parts.dart';
import 'package:feniq/core/widgets/full_text.dart';

/// One card in the Offers & Ads hero carousel: a picture, what it is, what it
/// saves, and where it is from.
///
/// Deliberately quiet for a "featured" slot - the app's own card surface, its
/// own text theme, its own badge language, no gradient and no oversized
/// promotional type. The only accent is the price, in the app's primary
/// colour, exactly as the catalog renders a price.
class PromotionHeroCard extends StatelessWidget {
  const PromotionHeroCard({super.key, required this.promotion, required this.onTap});

  final Promotion promotion;
  final VoidCallback onTap;

  // 208, not 176: room for the badges, meta and price lines at the 12 pt
  // floor every small label now keeps (they wrapped and overflowed at 176).
  static const double height = 208;

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    // An offer leads with its medicine, the offer's own title under it; a
    // package leads with its title, how many products under it.
    final subtitle = switch (promotion) {
      OfferPromotion() => promotion.subline(isArabic) ?? '',
      PackagePromotion(:final advertisement) =>
        context.l10n.advertisementProductCount(advertisement.items.length),
    };

    return SizedBox(
      height: height,
      child: PromotionSurface(
        onTap: onTap,
        child: Row(
          children: [
            PromotionThumbnail(promotion: promotion, width: 100, height: height),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(AppSizes.spacingMedium),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // A Wrap: on a narrow phone the saving badge moves under
                    // the offer badge rather than either being cut or pushed
                    // past the card edge.
                    Wrap(
                      spacing: AppSizes.spacingSmall,
                      runSpacing: AppSizes.spacingXSmall,
                      children: [
                        PromotionKindBadge(kind: promotion.kind),
                        PromotionSavingBadge(promotion: promotion),
                      ],
                    ),
                    const SizedBox(height: AppSizes.spacingSmall),
                    // The carousel's pages are a fixed height, so the title
                    // and subtitle get whatever room is left and, when they
                    // need more lines than fit, are drawn smaller to fit it -
                    // shown in full, never cut off.
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, box) => FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: AlignmentDirectional.topStart,
                          child: SizedBox(
                            width: box.maxWidth,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  promotion.headline(isArabic),
                                  style: context.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textOf(context),
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  subtitle,
                                  style: context.textTheme.bodySmall?.copyWith(
                                    color: AppColors.textSecondaryOf(context),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    PromotionMetaLine(promotion: promotion),
                    const SizedBox(height: AppSizes.spacingXSmall),
                    PromotionPriceLine(promotion: promotion),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The compact version of the same card for the browsable list below the
/// carousel: identical language, less of it.
class PromotionListCard extends StatelessWidget {
  const PromotionListCard({
    super.key,
    required this.promotion,
    required this.onTap,
    this.action,
  });

  final Promotion promotion;

  /// Null leaves the card inert - the state the warehouse offers list uses for
  /// a promotion there is nothing left to do with (already in the cart, or
  /// unavailable), where its [action] is the control instead.
  final VoidCallback? onTap;

  /// An optional control the card owns, drawn on its own full-width row under
  /// everything else - today the warehouse offers list's add-to-cart button or
  /// its in-cart quantity stepper. Null (the Offers & Ads tab) draws the card
  /// exactly as it always was.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    return PromotionSurface(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingSmall + 2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PromotionThumbnail(
              promotion: promotion,
              width: 64,
              height: 64,
              borderRadius: AppRadius.small,
            ),
            const SizedBox(width: AppSizes.spacingMedium),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 3:2 - the title gets the lion's share of a narrow row but
                  // the badge is never squeezed out of it entirely.
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Flexible(
                        flex: 3,
                        child: FullText(
                          promotion.headline(isArabic),
                          style: context.textTheme.titleSmall?.copyWith(
                            color: AppColors.textOf(context),
                            fontWeight: FontWeight.w700,
                          )),
                      ),
                      const SizedBox(width: AppSizes.spacingSmall),
                      Flexible(flex: 2, child: PromotionSavingBadge(promotion: promotion)),
                    ],
                  ),
                  // The offer's own title ("عرض الشهر"), small, under the
                  // medicine it is about.
                  if (promotion.subline(isArabic) case final subline?) ...[
                    const SizedBox(height: 2),
                    Text(
                      subline,
                      style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                    ),
                  ],
                  const SizedBox(height: AppSizes.spacingXSmall),
                  PromotionMetaLine(promotion: promotion),
                  const SizedBox(height: AppSizes.spacingSmall),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      PromotionKindBadge(kind: promotion.kind),
                      const SizedBox(width: AppSizes.spacingSmall),
                      // Bounded, so two long SYP figures wrap onto a second
                      // line instead of running off the card.
                      Flexible(child: PromotionPriceLine(promotion: promotion, compact: true)),
                    ],
                  ),
                  // A row of its own rather than a trailing slot beside the
                  // price: the in-cart stepper is 122pt wide and would squeeze
                  // the price line (a Wrap of unbounded Texts) off the edge of
                  // a narrow phone.
                  if (action != null) ...[
                    const SizedBox(height: AppSizes.spacingSmall),
                    action!,
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
