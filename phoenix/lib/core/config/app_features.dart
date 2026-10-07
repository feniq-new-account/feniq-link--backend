/// Features the owner has switched off for now. The code behind each stays in
/// place and tested; flipping the switch brings the feature back.
class AppFeatures {
  AppFeatures._();

  /// Discount codes typed at checkout (the owner's call: hidden for now).
  /// Settable so tests can exercise the feature while it is off.
  static bool discountCodes = false;
}
