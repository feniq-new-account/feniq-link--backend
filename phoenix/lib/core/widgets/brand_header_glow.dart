import 'package:flutter/material.dart';

import '../constants/app_colors.dart';

/// The FENIQ website's header light, as an app bar's `flexibleSpace`: the deep
/// navy ground with a faint ember glow rising from the logo's corner. Purely
/// decorative and static - it never animates, so it costs one paint.
class BrandHeaderGlow extends StatelessWidget {
  const BrandHeaderGlow({super.key});

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.navyOf(context),
        gradient: RadialGradient(
          center: Alignment(rtl ? 0.85 : -0.85, -1.2),
          radius: 1.5,
          colors: [
            AppColors.brandOrangeDeep.withValues(alpha: 0.22),
            AppColors.navyOf(context).withValues(alpha: 0),
          ],
          stops: const [0, 1],
        ),
      ),
      child: const SizedBox.expand(),
    );
  }
}
