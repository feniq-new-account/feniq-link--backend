import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import '../constants/app_padding.dart';
import '../constants/app_radius.dart';
import '../constants/app_sizes.dart';
import 'app_text_theme.dart';

// One recipe for both modes, taken from the FENIQ website: a deep navy header,
// pill-shaped actions in the display face, soft large cards with hairline
// borders, and the orange kept for the primary action and the current
// selection only.
class AppThemeBuilder {
  const AppThemeBuilder._();

  static ThemeData build({
    required Brightness brightness,
    required ColorScheme colorScheme,
    required TextTheme textTheme,
    required Color background,
    required Color surface,
    required Color surfaceElevated,
    required Color border,
    required Color text,
    required Color textSecondary,
    required Color primary,
    required Color error,
  }) {
    final isDark = brightness == Brightness.dark;
    final pill = const StadiumBorder();
    final buttonText = AppTextTheme.style(fontSize: 15, fontWeight: AppTextTheme.semiBold);
    final minButton = const Size(64, AppSizes.buttonHeight);

    OutlineInputBorder outline(Color color, [double width = 1]) => OutlineInputBorder(
      borderRadius: AppRadius.small,
      borderSide: BorderSide(color: color, width: width),
    );

    return ThemeData(
      useMaterial3: true,
      // Catch-all: TextTheme below covers the roles the app styles itself,
      // but Material composes plenty of text from its own defaults (menu
      // entries, tooltips, date pickers). Setting the family here means none
      // of those silently fall back to the OS's default Arabic face.
      fontFamily: AppTextTheme.fontFamily,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: background,
      textTheme: textTheme,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? surfaceElevated : AppColors.header,
        foregroundColor: isDark ? text : Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleSpacing: 20,
        // A hairline instead of a drop shadow, the way the site's header
        // meets its page.
        shape: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: isDark ? 0.06 : 0.08))),
        titleTextStyle: AppTextTheme.style(
          fontSize: 19,
          fontWeight: AppTextTheme.bold,
          color: isDark ? text : Colors.white,
        ),
      ),
      cardTheme: CardThemeData(
        color: surfaceElevated,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.large, side: BorderSide(color: border)),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: isDark ? Colors.black : AppColors.onPrimary,
          shape: pill,
          minimumSize: minButton,
          padding: AppPadding.button,
          textStyle: buttonText,
          elevation: 0,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: isDark ? Colors.black : AppColors.onPrimary,
          shape: pill,
          padding: AppPadding.button,
          textStyle: buttonText,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: text,
          side: BorderSide(color: isDark ? border : AppColors.navySurface.withValues(alpha: 0.35)),
          shape: pill,
          padding: AppPadding.button,
          textStyle: buttonText,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: isDark ? primary : AppColors.lightPrimaryText,
          shape: pill,
          textStyle: AppTextTheme.style(fontSize: 14, fontWeight: AppTextTheme.semiBold),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: primary,
        foregroundColor: isDark ? Colors.black : AppColors.onPrimary,
        elevation: 2,
        highlightElevation: 4,
        shape: pill,
        extendedTextStyle: buttonText,
      ),
      chipTheme: ChipThemeData(
        shape: StadiumBorder(side: BorderSide(color: border)),
        side: BorderSide(color: border),
        backgroundColor: surfaceElevated,
        selectedColor: isDark ? primary.withValues(alpha: 0.22) : AppColors.navySurface.withValues(alpha: 0.12),
        labelStyle: AppTextTheme.style(fontSize: 13, fontWeight: AppTextTheme.medium, color: text),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding: AppPadding.input,
        hintStyle: AppTextTheme.style(fontSize: 14, fontWeight: AppTextTheme.regular, color: textSecondary, reading: true),
        labelStyle: AppTextTheme.style(fontSize: 14, fontWeight: AppTextTheme.medium, color: textSecondary),
        border: outline(border),
        enabledBorder: outline(border),
        focusedBorder: outline(primary, 1.6),
        errorBorder: outline(error),
        focusedErrorBorder: outline(error, 1.6),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surfaceElevated,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: border,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surfaceElevated,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(26))),
        titleTextStyle: AppTextTheme.style(fontSize: 19, fontWeight: AppTextTheme.bold, color: text),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? surfaceElevated : AppColors.header,
        contentTextStyle: AppTextTheme.style(fontSize: 14, fontWeight: AppTextTheme.medium, color: isDark ? text : Colors.white),
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.small),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: primary,
        unselectedLabelColor: textSecondary,
        indicatorColor: primary,
        dividerColor: border,
        labelStyle: AppTextTheme.style(fontSize: 14, fontWeight: AppTextTheme.semiBold),
        unselectedLabelStyle: AppTextTheme.style(fontSize: 14, fontWeight: AppTextTheme.medium),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: primary),
      listTileTheme: ListTileThemeData(
        iconColor: textSecondary,
        titleTextStyle: AppTextTheme.style(fontSize: 15, fontWeight: AppTextTheme.medium, color: text),
        subtitleTextStyle: AppTextTheme.style(fontSize: 13, fontWeight: AppTextTheme.regular, color: textSecondary, reading: true),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        // Light mode closes the screen with a navy bar to match the header,
        // so the white page sits inside a navy frame.
        backgroundColor: isDark ? surfaceElevated : AppColors.navySurface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: isDark ? primary.withValues(alpha: 0.20) : Colors.white.withValues(alpha: 0.10),
        indicatorShape: const StadiumBorder(),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 24,
            color: states.contains(WidgetState.selected)
                ? (isDark ? primary : AppColors.onNavyAccent)
                : (isDark ? textSecondary : AppColors.onNavyMuted),
          ),
        ),
        // 12: the tab labels are single words ("الحسابات" / "Accounts"), so
        // they fit a fifth of a 360dp phone on one line - which the icon
        // alignment depends on - and stay above the 11 pt legibility floor
        // after the app-wide 0.93 text scale.
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => AppTextTheme.style(
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? AppTextTheme.semiBold : AppTextTheme.medium,
            color: states.contains(WidgetState.selected)
                ? (isDark ? primary : AppColors.onNavyAccent)
                : (isDark ? textSecondary : AppColors.onNavyMuted),
          ),
        ),
      ),
    );
  }
}
