import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/offline/medicine_keys.dart';

// Mirrors backend/test/medicineKeys.test.js and the normalizeText rules: the
// phone must fold a name exactly as the server does.
void main() {
  group('normalizeText', () {
    test('lower-cases, unifies hamza / ta marbuta / alef maksura and drops diacritics', () {
      expect(normalizeText('Panadol'), 'panadol');
      expect(normalizeText('إبرة'), normalizeText('ابره'));
      expect(normalizeText('مَنَاعَة'), 'مناعه');
      expect(normalizeText('على'), normalizeText('علي'));
    });

    test('Arabic digits become Western digits and punctuation becomes a space', () {
      expect(normalizeText('باراسيتامول ٥٠٠'), 'باراسيتامول 500');
      expect(normalizeText('Co-Amoxiclav (625)'), 'co amoxiclav 625');
      expect(normalizeText('  a   b  '), 'a b');
    });

    test('a missing value is empty', () {
      expect(normalizeText(null), '');
      expect(normalizeText(''), '');
    });
  });

  group('strengthKeyOf', () {
    test('the dosage-form suffix is not part of the strength', () {
      for (final text in ['400 MG/TAB.', '400 MG/CTD TAB.', '400MG/F.CTD TAB.', '400 mg', ' 400  MG / TAB ']) {
        expect(strengthKeyOf(text), '400mg', reason: text);
      }
      expect(strengthKeyOf('10 MG/SOFT G.CAP.'), '10mg');
    });

    test('a concentration keeps its volume, and per 1 ml equals per ml', () {
      expect(strengthKeyOf('125 MG/5 ML.'), '125mg/5ml');
      expect(strengthKeyOf('125 MG/5 ML.'), isNot(strengthKeyOf('250 MG/5 ML.')));
      expect(strengthKeyOf('1 MG/ML.'), strengthKeyOf('1 MG/1 ML.'));
    });

    test('nothing to compare is null', () {
      expect(strengthKeyOf(''), isNull);
      expect(strengthKeyOf(null), isNull);
    });
  });

  group('formKeyOf', () {
    test('plain and coated tablets, plain and soft capsules are one kind; others are not', () {
      expect(formKeyOf('أقراص'), formKeyOf('أقراص ملبسة'));
      expect(formKeyOf('محافظ'), formKeyOf('محافظ جيلاتينية طرية'));
      expect(formKeyOf('أقراص'), isNot(formKeyOf('أقراص مديدة التحرر')));
      expect(formKeyOf('قطرة عينية'), isNot(formKeyOf('كريم')));
      expect(formKeyOf(null), isNull);
    });
  });
}
