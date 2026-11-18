import 'package:feniq/generated/app_localizations.dart';

/// "Marked delivered automatically in 5 hours" for an order on the road, or
/// null when it has no deadline. [autoDeliverAt] comes from the server, which
/// owns the rule (a day after the order first left); the hourly job closes it
/// up to an hour after that, so a passed deadline reads "within the hour".
/// Whole hours are rounded down from one hour on, minutes rounded up below it.
/// Only an order still on the road ([status] 'out_for_delivery') shows one,
/// whatever deadline a stale copy might still carry.
String? autoDeliverLabel(AppLocalizations l10n, DateTime? autoDeliverAt, DateTime now, {required String status}) {
  if (autoDeliverAt == null || status != 'out_for_delivery') return null;
  final left = autoDeliverAt.difference(now);
  if (left <= Duration.zero) return l10n.warehouseAutoDeliverDue;
  if (left >= const Duration(hours: 1)) return l10n.warehouseAutoDeliverHours(left.inHours);
  final minutes = (left.inSeconds / 60).ceil();
  return l10n.warehouseAutoDeliverMinutes(minutes);
}
