import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import '../constants/app_padding.dart';
import '../constants/app_shadows.dart';
import '../constants/app_sizes.dart';
import '../extensions/build_context_extensions.dart';
import '../theme/app_text_theme.dart';
import 'press_scale.dart';

/// The one primary action on a screen: the FENIQ website's call to action - a
/// pill of the bird's orange with a warm glow under it.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !isLoading;
    final onColor = context.isDarkMode ? Colors.black : Colors.white;
    return PressScale(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: double.infinity,
        height: AppSizes.buttonHeight,
        decoration: ShapeDecoration(
          shape: const StadiumBorder(),
          gradient: enabled || isLoading ? AppColors.brandGradient : null,
          color: enabled || isLoading ? null : AppColors.borderOf(context),
          shadows: enabled ? AppShadows.glow(context) : const [],
        ),
        // A real ElevatedButton over the gradient, so focus, semantics and the
        // disabled state behave exactly like every other button in the app.
        child: ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            disabledBackgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: onColor,
            disabledForegroundColor: AppColors.textSecondaryOf(context),
            elevation: 0,
            shape: const StadiumBorder(),
            padding: AppPadding.button,
            textStyle: AppTextTheme.style(fontSize: 15.5, fontWeight: AppTextTheme.semiBold),
          ),
          child: isLoading
              ? SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: onColor),
                )
              : Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ),
    );
  }
}
