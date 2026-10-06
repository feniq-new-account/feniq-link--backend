/// The name the app shows for a medicine or a company: the English one when
/// there is one, otherwise the Arabic. The owner's choice - medicine and
/// company names read the way they are printed on the box, in English.
String englishFirst(String? english, String arabic) {
  final en = english?.trim();
  return en == null || en.isEmpty ? arabic : en;
}

/// [englishFirst] for an optional Arabic name.
String? englishFirstOrNull(String? english, String? arabic) {
  final en = english?.trim();
  return en == null || en.isEmpty ? arabic : en;
}
