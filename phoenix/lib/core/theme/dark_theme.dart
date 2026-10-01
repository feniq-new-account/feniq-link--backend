import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import 'app_text_theme.dart';
import 'app_theme_builder.dart';

class DarkTheme {
  const DarkTheme._();

  static ThemeData get data => AppThemeBuilder.build(
    brightness: Brightness.dark,
    colorScheme: ColorScheme.dark(
      primary: AppColors.darkPrimary,
      onPrimary: Colors.black,
      secondary: AppColors.darkSecondary,
      onSecondary: Colors.black,
      error: AppColors.darkError,
      onError: Colors.black,
      surface: AppColors.darkBackground,
      onSurface: AppColors.darkText,
      outline: AppColors.darkBorder,
      outlineVariant: AppColors.darkBorder,
    ),
    textTheme: AppTextTheme.dark(),
    background: AppColors.darkBackground,
    surface: AppColors.darkSurface,
    surfaceElevated: AppColors.darkSurfaceElevated,
    border: AppColors.darkBorder,
    text: AppColors.darkText,
    textSecondary: AppColors.darkTextSecondary,
    primary: AppColors.darkPrimary,
    error: AppColors.darkError,
  );
}
