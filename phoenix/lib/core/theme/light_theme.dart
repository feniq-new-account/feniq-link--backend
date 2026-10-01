import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import 'app_text_theme.dart';
import 'app_theme_builder.dart';

class LightTheme {
  const LightTheme._();

  static ThemeData get data => AppThemeBuilder.build(
    brightness: Brightness.light,
    // Explicit, not ColorScheme.fromSeed - the brand colors are exact values
    // the app is required to use, not a seed for Material 3 to approximate.
    colorScheme: ColorScheme.light(
      primary: AppColors.lightPrimary,
      onPrimary: Colors.white,
      secondary: AppColors.lightSecondary,
      onSecondary: Colors.white,
      error: AppColors.lightError,
      onError: Colors.white,
      surface: AppColors.lightBackground,
      onSurface: AppColors.lightText,
      outline: AppColors.lightBorder,
      outlineVariant: AppColors.lightBorder,
    ),
    textTheme: AppTextTheme.light(),
    background: AppColors.lightBackground,
    surface: AppColors.lightSurface,
    surfaceElevated: AppColors.lightSurfaceElevated,
    border: AppColors.lightBorder,
    text: AppColors.lightText,
    textSecondary: AppColors.lightTextSecondary,
    primary: AppColors.lightPrimary,
    error: AppColors.lightError,
  );
}
