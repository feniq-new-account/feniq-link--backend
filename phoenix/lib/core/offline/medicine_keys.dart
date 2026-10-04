// The app-side twin of the backend's utils/normalizeText.js and
// utils/medicineKeys.js. The offline catalog (catalog_snapshot.dart) searches
// and finds alternatives on the phone, so it has to fold a name exactly the
// way the server does: a search typed with a different hamza or ta marbuta
// must find the same medicines offline as it does online. Keep the two in step.

final RegExp _indicDigits = RegExp('[٠-٩۰-۹]');
final RegExp _marks = RegExp('[ً-ْٰـ]');
final RegExp _alefVariants = RegExp('[أإآٱ]');
final RegExp _punctuation = RegExp('[-_.,/()،؛]');
final RegExp _whitespace = RegExp(r'\s+');

/// The one comparable form of a name: lower case, no diacritics, unified
/// hamza / ta marbuta / alef maksura, Western digits, punctuation as a space.
String normalizeText(String? value) {
  if (value == null) return '';
  var text = value.replaceAllMapped(_indicDigits, (match) {
    final code = match[0]!.codeUnitAt(0);
    return (code >= 0x06f0 ? code - 0x06f0 : code - 0x0660).toString();
  });
  text = text
      .toLowerCase()
      .replaceAll(_marks, '')
      .replaceAll(_alefVariants, 'ا')
      .replaceAll('ة', 'ه')
      .replaceAll('ى', 'ي')
      .replaceAll('ؤ', 'و')
      .replaceAll('ئ', 'ي')
      .replaceAll(_punctuation, ' ')
      .replaceAll(_whitespace, ' ')
      .trim();
  return text;
}

const Set<String> _measureUnits = {'ml', 'g', 'l', 'mg', 'mcg', 'iu', 'dose'};

/// "400 MG/TAB." and "400 MG/CTD TAB." are the same strength; "125 MG/5 ML."
/// keeps its volume. Null when there is nothing to compare.
String? strengthKeyOf(String? value) {
  if (value == null) return null;
  var key = value.toLowerCase().replaceAll(_whitespace, '').replaceAll(RegExp(r'[.,]+$'), '');
  if (key.isEmpty) return null;
  key = key.replaceAllMapped(RegExp(r'/1(ml|g|l)$'), (match) => '/${match[1]}');
  final slash = key.lastIndexOf('/');
  if (slash > 0) {
    final suffix = key.substring(slash + 1).replaceAll(RegExp(r'\.+$'), '');
    if (RegExp(r'^[a-z.]+$').hasMatch(suffix) && !_measureUnits.contains(suffix)) {
      key = key.substring(0, slash);
    }
  }
  key = key.replaceAll(RegExp(r'\.+$'), '');
  return key.isEmpty ? null : key;
}

/// Plain and coated tablets (and plain and soft-gel capsules) are one kind of
/// form to a pharmacist choosing a substitute; every other form stays its own.
String? formKeyOf(String? value) {
  final key = normalizeText(value);
  if (key.isEmpty) return null;
  if (key == 'اقراص' || key == 'اقراص ملبسه') {
    return 'tablet';
  }
  if (key == 'محافظ' || key == 'محافظ جيلاتينيه طريه') {
    return 'capsule';
  }
  return key;
}
