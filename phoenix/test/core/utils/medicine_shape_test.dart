import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/utils/medicine_shape.dart';

void main() {
  group('medicineShapeFor', () {
    const expected = {
      MedicineShape.tablets: ['أقراص', 'أقراص ملبسة', 'أقراص للمضغ', 'أقراص فوارة', 'أقراص مديدة التحرر', 'أقراص تحت اللسان', 'حزمة (أقراص+ أقراص ملبسة)', 'TABLET'],
      MedicineShape.capsules: ['محافظ', 'محافظ جيلاتينية طرية', 'محافظ مديدة التحرر', 'Capsule'],
      MedicineShape.injection: ['محلول للحقن/حبابات', 'بودرة للحقن/فيال', 'محلول للحقن/فيال', 'معلق للحقن', 'سيرنغ معبأ/للحقن', 'مخدر سني/ خرطوش', 'محلول تسريب وريدي/ عبوة او كيس', 'محلول للحقن/كيس سيروم(P.V.C.)', 'أمبولات'],
      MedicineShape.syrup: ['شراب', 'معلق جاف', 'معلق فموي', 'محلول', 'سيروم', 'فيال فموي', 'الكسير', 'ماء محل', 'شراب وحيد الجرعة'],
      MedicineShape.drops: ['قطرة عينية', 'نقط فموية', 'قطرة أذن', 'قطرة انف', 'قطرة عينية \\جرعة وحيدة', 'قطرة عينية /أذنية', 'محلول عيني'],
      MedicineShape.tube: ['كريم', 'مرهم', 'جل', 'مرهم عيني\\غرام', 'كريم مهبلي', 'مرهم شرجي', 'جل فموي', 'معجون فموي', 'مستحلب جلدي', 'شامبو'],
      MedicineShape.suppository: ['تحاميل', 'بيوض مهبلية', 'أقراص مهبلية', 'رحضة شرجية'],
      MedicineShape.sachet: ['ظروف', 'بودرة /فموي', 'ظروف / شراب', 'بودرة موضعية'],
      MedicineShape.inhaler: ['بخاخ أنفي', 'بخة محددة', 'بخاخ', 'رذاذ', 'محلول للاستنشاق/حبابات', 'محافظ للاستنشاق', 'بخاخ فموي'],
    };

    expected.forEach((shape, forms) {
      for (final form in forms) {
        test('"$form" -> ${shape.name}', () => expect(medicineShapeFor(form), shape));
      }
    });

    test('no form, an empty one, or one we do not know -> the common drawing', () {
      expect(medicineShapeFor(null), MedicineShape.generic);
      expect(medicineShapeFor(''), MedicineShape.generic);
      expect(medicineShapeFor('   '), MedicineShape.generic);
      expect(medicineShapeFor('شاش طبي'), MedicineShape.generic);
      expect(medicineShapeFor('علكة'), MedicineShape.generic);
    });

    test('spelling variants find the same drawing (hamza, ta marbuta, tashkeel)', () {
      expect(medicineShapeFor('اقراص'), MedicineShape.tablets);
      expect(medicineShapeFor('قَطْرَة عينية'), MedicineShape.drops);
      expect(medicineShapeFor('محافظ'), MedicineShape.capsules);
    });
  });
}
