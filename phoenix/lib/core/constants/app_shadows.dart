import 'package:flutter/material.dart';

import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'app_colors.dart';

// Depth the way the FENIQ website does it: a wide, soft, navy-tinted lift
// under raised surfaces, and a warm glow under the one primary action.
class AppShadows {
  const AppShadows._();

  /// Raised cards and tiles.
  static List<BoxShadow> card(BuildContext context) => context.isDarkMode
      ? [BoxShadow(color: Colors.black.withValues(alpha: 0.32), blurRadius: 24, offset: const Offset(0, 10))]
      : [
          BoxShadow(color: AppColors.lightNavy.withValues(alpha: 0.07), blurRadius: 28, offset: const Offset(0, 12)),
          BoxShadow(color: AppColors.lightNavy.withValues(alpha: 0.04), blurRadius: 3, offset: const Offset(0, 1)),
        ];

  /// The primary action's warm glow.
  static List<BoxShadow> glow(BuildContext context) => [
    BoxShadow(
      color: AppColors.primaryOf(context).withValues(alpha: context.isDarkMode ? 0.28 : 0.34),
      blurRadius: 22,
      offset: const Offset(0, 8),
    ),
  ];
}
