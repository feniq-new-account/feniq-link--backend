import 'package:flutter/widgets.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/generated/app_localizations.dart';

/// A pharmacy's name in the language the app is showing, falling back to the
/// other one when it has none.
String repPharmacyName(BuildContext context, String nameAr, String nameEn) {
  final arabic = Localizations.localeOf(context).languageCode == 'ar';
  final preferred = arabic ? nameAr : nameEn;
  if (preferred.trim().isNotEmpty) return preferred;
  return arabic ? nameEn : nameAr;
}

/// A percentage without trailing zeros: 1 -> "1%", 0.5 -> "0.5%", 1.25 -> "1.25%".
String repPercent(double value) {
  final rounded = (value * 100).round() / 100;
  final text = rounded == rounded.roundToDouble() ? rounded.toInt().toString() : rounded.toString();
  return '$text%';
}

String visitStatusLabel(AppLocalizations l10n, VisitStatus status) {
  switch (status) {
    case VisitStatus.verified:
      return l10n.repVisitVerified;
    case VisitStatus.outOfRange:
      return l10n.repVisitOutOfRange;
    case VisitStatus.mockLocation:
      return l10n.repVisitMockLocation;
    case VisitStatus.noPharmacyLocation:
      return l10n.repVisitNoPharmacyLocation;
    case VisitStatus.locationUnapproved:
      return l10n.repVisitLocationUnapproved;
    case VisitStatus.poorAccuracy:
      return l10n.repVisitPoorAccuracy;
    case VisitStatus.staleLocation:
      return l10n.repVisitStaleLocation;
  }
}

StatusBadgeTone visitStatusTone(VisitStatus status) {
  switch (status) {
    case VisitStatus.verified:
      return StatusBadgeTone.success;
    case VisitStatus.outOfRange:
    case VisitStatus.mockLocation:
      return StatusBadgeTone.danger;
    case VisitStatus.noPharmacyLocation:
    case VisitStatus.locationUnapproved:
    case VisitStatus.poorAccuracy:
    case VisitStatus.staleLocation:
      return StatusBadgeTone.pending;
  }
}

/// "Last visit: 3 days ago" - by calendar day, not by 24-hour blocks, so a
/// visit at 11 pm yesterday reads "yesterday" at 8 am. Never visited when
/// there is no visit at all.
String lastVisitText(AppLocalizations l10n, DateTime? lastVisit, DateTime now) {
  if (lastVisit == null) return l10n.repNeverVisited;
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(lastVisit.year, lastVisit.month, lastVisit.day);
  final days = today.difference(day).inDays;
  return l10n.repLastVisitAgo(days < 0 ? 0 : days);
}
