import 'display_name.dart';
import 'package:intl/intl.dart';

class DateFormatter {
  const DateFormatter._();

  static String formatDate(DateTime dateTime, {String? locale}) {
    if (locale?.startsWith('ar') == true) return ltrIsolate(DateFormat('yyyy/MM/dd', 'en').format(dateTime));
    return DateFormat('MMM d, yyyy', 'en').format(dateTime);
  }

  static String formatDateTime(DateTime dateTime, {String? locale}) {
    if (locale?.startsWith('ar') == true) {
      return ltrIsolate(DateFormat('yyyy/MM/dd HH:mm', 'en').format(dateTime.toLocal()));
    }
    return DateFormat('MMM d, h:mm a', 'en').format(dateTime.toLocal());
  }
}
