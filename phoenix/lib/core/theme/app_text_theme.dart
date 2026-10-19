import 'package:flutter/material.dart';

import '../constants/app_colors.dart';

// The FENIQ website's two faces, so the app and the site read as one brand:
//   Readex Pro           - the voice: titles, buttons, labels, prices.
//   IBM Plex Sans Arabic - reading text: descriptions, list details, forms.
// Both draw Arabic and Latin together, so medicine names in Latin and the
// Western numerals sit in the same voice as the Arabic around them. Bundled
// from assets/fonts rather than fetched through google_fonts - the pharmacy
// app is used on flaky connections, and a runtime font download that fails
// silently falls back to whatever generic Arabic face the OS ships.
//
// Both families ship real 400/500/600/700 faces, so every tier below is a
// drawn weight, never a synthesised one. Asking for w800/w900 lands on 700.
class AppTextTheme {
  const AppTextTheme._();

  /// Reading text, and the catch-all for anything Material composes itself.
  static const String fontFamily = 'Plex';

  /// Titles, buttons, labels, prices.
  static const String displayFamily = 'Readex';

  /// Body copy.
  static const FontWeight regular = FontWeight.w400;

  /// Buttons, inputs, form labels - anything interactive.
  static const FontWeight medium = FontWeight.w500;

  /// Subheadings.
  static const FontWeight semiBold = FontWeight.w600;

  /// Headings and prices.
  static const FontWeight bold = FontWeight.w700;

  /// A style in the display face (the default) or, with [reading], the body
  /// face.
  static TextStyle style({
    required double fontSize,
    required FontWeight fontWeight,
    Color? color,
    double? height,
    bool reading = false,
  }) => TextStyle(
    fontFamily: reading ? fontFamily : displayFamily,
    fontSize: fontSize,
    fontWeight: fontWeight,
    height: height,
    color: color,
    letterSpacing: reading ? null : -0.1,
  );

  static TextTheme _scale(Color primaryColor) => TextTheme(
    displaySmall: style(fontSize: 26, fontWeight: bold, height: 1.25, color: primaryColor),
    headlineSmall: style(fontSize: 22, fontWeight: bold, height: 1.3, color: primaryColor),
    titleLarge: style(fontSize: 20, fontWeight: bold, height: 1.3, color: primaryColor),
    titleMedium: style(fontSize: 16, fontWeight: semiBold, height: 1.35, color: primaryColor),
    titleSmall: style(fontSize: 13, fontWeight: semiBold, height: 1.35, color: primaryColor),
    bodyLarge: style(fontSize: 16, fontWeight: regular, height: 1.6, color: primaryColor, reading: true),
    bodyMedium: style(fontSize: 14, fontWeight: regular, height: 1.55, color: primaryColor, reading: true),
    bodySmall: style(fontSize: 12, fontWeight: regular, height: 1.5, color: primaryColor, reading: true),
    labelLarge: style(fontSize: 14.5, fontWeight: semiBold, color: primaryColor),
    labelMedium: style(fontSize: 12.5, fontWeight: medium, color: primaryColor),
    labelSmall: style(fontSize: 12, fontWeight: medium, color: primaryColor),
  );

  static TextTheme light() => _scale(AppColors.lightText);

  static TextTheme dark() => _scale(AppColors.darkText);
}
