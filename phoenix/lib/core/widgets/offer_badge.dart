import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';

/// The mark of an exceptional offer: a solid red pill with a tag icon and
/// "عرض استثنائي" in white, so a medicine on offer stands out from a regular
/// one at a glance - in the catalog, the offers list and the featured cards
/// alike. [OfferBadge.frameColor] is the matching outline for the card.
class OfferBadge extends StatelessWidget {
  const OfferBadge({super.key, this.compact = false});

  /// A smaller pill for tight spots (a grid card's image corner).
  final bool compact;

  /// The red the badge is drawn in, for a card's matching outline.
  static Color frameColor(BuildContext context) => AppColors.errorOf(context);

  @override
  Widget build(BuildContext context) {
    final red = frameColor(context);
    return Semantics(
      label: context.l10n.exceptionalOfferBadge,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: compact ? 3 : 4),
        decoration: BoxDecoration(
          color: red,
          borderRadius: BorderRadius.circular(999),
          boxShadow: [BoxShadow(color: red.withValues(alpha: 0.35), blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.local_offer, size: compact ? 12 : 14, color: Colors.white),
            const SizedBox(width: 4),
            // Its natural width wherever there is room; squeezed (a narrow
            // phone, a large system font) it shrinks rather than overflow.
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  context.l10n.exceptionalOfferBadge,
                  maxLines: 1,
                  softWrap: false,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: compact ? 11 : 12,
                    fontWeight: FontWeight.w800,
                    height: 1.2,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
