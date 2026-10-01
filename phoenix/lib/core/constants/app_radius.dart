import 'package:flutter/material.dart';

// Soft, generous corners, same as the FENIQ website: inputs and small tiles at
// 14, cards at 22, and anything you press is a pill.
class AppRadius {
  const AppRadius._();

  static const BorderRadius small = BorderRadius.all(Radius.circular(14));
  static const BorderRadius medium = BorderRadius.all(Radius.circular(18));
  static const BorderRadius large = BorderRadius.all(Radius.circular(22));
  static const BorderRadius badge = BorderRadius.all(Radius.circular(999));
  static const BorderRadius full = BorderRadius.all(Radius.circular(999));
}
