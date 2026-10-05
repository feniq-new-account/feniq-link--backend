/// The catalog (warehouses, companies, medicines, prices) is refreshed once a
/// day, not on every open or pull: a copy saved since the last daily cutoff
/// (05:00 on the phone's clock, when nobody is ordering) is today's, and the
/// screens read it straight from the phone. The first open after the cutoff
/// downloads a new one.
///
/// Orders, the cart and order tracking are not covered - they always ask the
/// server.
class DailyRefresh {
  const DailyRefresh._();

  /// The hour of the day the catalog turns over.
  static const int cutoffHour = 5;

  /// The most recent cutoff at or before [now].
  static DateTime lastCutoff([DateTime? now]) {
    final at = now ?? DateTime.now();
    final today = DateTime(at.year, at.month, at.day, cutoffHour);
    return at.isBefore(today) ? today.subtract(const Duration(days: 1)) : today;
  }

  /// Whether a copy saved at [savedAt] is still today's.
  static bool isCurrent(DateTime savedAt, [DateTime? now]) => !savedAt.isBefore(lastCutoff(now));
}
