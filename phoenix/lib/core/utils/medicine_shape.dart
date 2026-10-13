/// Which picture stands in for a medicine that has none, by its dosage form
/// (the "الشكل الصيدلاني" of the ministry list: "أقراص ملبسة", "شراب", "كريم",
/// "محلول للحقن/حبابات" ...). Tablets get a blister strip, injectables a
/// syringe, syrups a bottle, creams a tube and so on; a form that is empty or
/// not recognised gets [MedicineShape.generic], one picture that suits every
/// medicine.
enum MedicineShape { generic, tablets, capsules, injection, syrup, drops, tube, suppository, sachet, inhaler }

// Letter forms that differ only by spelling convention are unified (the same
// rules as the server's normalizeText), tashkeel and tatweel are dropped.
final RegExp _marks = RegExp('[ً-ْٰـ]');
final RegExp _separators = RegExp(r'[^a-zء-ي]+');

String _normalize(String text) {
  return text
      .toLowerCase()
      .replaceAll(_marks, '')
      .replaceAll(RegExp('[أإآٱ]'), 'ا')
      .replaceAll('ة', 'ه')
      .replaceAll('ى', 'ي')
      .replaceAll('ؤ', 'و')
      .replaceAll('ئ', 'ي');
}

// A root may sit inside a word: "للحقن" (for injection) is "ل" + "الحقن".
bool _hasRoot(List<String> tokens, List<String> roots) =>
    tokens.any((token) => roots.any(token.contains));

// Roots are looked for inside each word, in this order: the first family a
// form belongs to wins ("محلول للاستنشاق" is an inhaler before it is a liquid,
// "أقراص مهبلية" a suppository before it is a tablet, "كريم مهبلي" a tube).
MedicineShape medicineShapeFor(String? dosageForm) {
  final tokens = _normalize(dosageForm ?? '').split(_separators).where((t) => t.isNotEmpty).toList();
  if (tokens.isEmpty) return MedicineShape.generic;

  if (_hasRoot(tokens, ['استنشاق', 'بخاخ', 'بخه', 'رذاذ', 'inhal', 'spray'])) return MedicineShape.inhaler;
  if (_hasRoot(tokens, ['حقن', 'سيرنغ', 'خرطوش', 'تسريب', 'امبول', 'inject', 'syringe', 'ampoule'])) {
    return MedicineShape.injection;
  }
  if (_hasRoot(tokens, ['قطره', 'نقط', 'drop']) || (tokens.contains('محلول') && tokens.contains('عيني'))) {
    return MedicineShape.drops;
  }
  if (_hasRoot(tokens, ['كريم', 'مرهم', 'معجون', 'مستحلب', 'شامبو', 'cream', 'ointment', 'gel']) ||
      tokens.contains('جل')) {
    return MedicineShape.tube;
  }
  if (_hasRoot(tokens, ['تحاميل', 'بيوض', 'مهبل', 'شرجي', 'رحضه', 'suppos'])) return MedicineShape.suppository;
  if (_hasRoot(tokens, ['ظروف', 'ظرف', 'بودره', 'sachet', 'powder'])) return MedicineShape.sachet;
  if (_hasRoot(tokens, ['محافظ', 'كبسول', 'capsule']) || tokens.contains('cap')) return MedicineShape.capsules;
  if (_hasRoot(tokens, ['اقراص', 'قرص', 'حزمه', 'tablet']) || tokens.contains('tab')) return MedicineShape.tablets;
  if (_hasRoot(tokens, ['شراب', 'معلق', 'محلول', 'سيروم', 'الكسير', 'فيال', 'ماء', 'سائل', 'غسول', 'syrup', 'suspension', 'solution'])) {
    return MedicineShape.syrup;
  }
  return MedicineShape.generic;
}
