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

/// [text] kept left-to-right inside right-to-left Arabic text, so a strength
/// like "100 MG/5 ML" never reads back as "MG/5 ML 100" - in a health app a
/// reversed strength can be misread. Wraps it in Unicode directional isolates.
String ltrIsolate(String text) => '\u2066$text\u2069';

final RegExp _arabicLetter = RegExp(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]');

/// Whether [text] has no Arabic letters - a name printed in English, like
/// "PANADOL 500 TAB." (see NameText for why that matters).
bool isLatinName(String text) => text.trim().isNotEmpty && !_arabicLetter.hasMatch(text);
