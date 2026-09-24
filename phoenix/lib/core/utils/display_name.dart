// A product's or manufacturer's name as the app shows it (catalog overhaul,
// pre-merge review): a medicine may be named in Arabic only, English only, or
// both. Show the name in the current UI language, else the other one - never
// an empty name, and never a reason to leave the product out.
String pickName(String? ar, String? en, {required bool arabic}) {
  final arabicName = ar?.trim() ?? '';
  final englishName = en?.trim() ?? '';
  final preferred = arabic ? arabicName : englishName;
  if (preferred.isNotEmpty) return preferred;
  final other = arabic ? englishName : arabicName;
  if (other.isNotEmpty) return other;
  return '—';
}
