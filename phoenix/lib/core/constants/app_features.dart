/// Launch-phase feature switches. Retain the existing review flows so they can
/// be restored deliberately once order fulfilment and distribution stabilize.
/// Backend/src/config/features.js independently denies writes while disabled.
abstract final class AppFeatures {
  static const bool mutualRatings = false;
}
