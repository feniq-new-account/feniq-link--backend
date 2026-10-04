import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/medicine_directory/data/medicine_directory.dart';

Map<String, dynamic> _row(
  String id,
  String nameAr, {
  String manufacturer = 'ألفا للأدوية',
  String? nameEn,
  String? ingredient,
  String? strength,
  String? form,
  bool? active,
}) => {
  'id': id,
  'nameAr': nameAr,
  'manufacturerAr': manufacturer,
  if (nameEn != null) 'nameEn': nameEn,
  if (ingredient != null) 'activeIngredient': ingredient,
  if (strength != null) 'strength': strength,
  if (form != null) 'dosageForm': form,
  if (active != null) 'isActive': active,
};

MedicineDirectory _directory(List<Map<String, dynamic>> rows) =>
    MedicineDirectory(rows: mergeDirectoryRows((const [], rows)), savedAt: DateTime(2026, 10, 4));

void main() {
  group('mergeDirectoryRows', () {
    test('indexes the rows and sorts them by name', () {
      final rows = mergeDirectoryRows((const [], [_row('2', 'باراسيتامول'), _row('1', 'أموكسيل')]));
      expect(rows.map((r) => r['id']), ['1', '2']);
      expect(rows.first['k'], contains('اموكسيل'));
    });

    test('a changed row replaces the old one, a withdrawn one goes, a new one arrives', () {
      final existing = mergeDirectoryRows((const [], [_row('1', 'أ'), _row('2', 'ب'), _row('3', 'ج')]));
      final merged = mergeDirectoryRows((
        existing,
        [_row('2', 'ب جديد'), _row('3', 'ج', active: false), _row('4', 'د')],
      ));
      expect(merged.map((r) => '${r['id']}:${r['nameAr']}'), ['1:أ', '2:ب جديد', '4:د']);
    });

    test('folding the same rows in twice changes nothing', () {
      final once = mergeDirectoryRows((const [], [_row('1', 'أ'), _row('2', 'ب')]));
      final twice = mergeDirectoryRows((once, [_row('1', 'أ'), _row('2', 'ب')]));
      expect(twice.map((r) => r['id']), once.map((r) => r['id']));
    });

    test('a row with no id is ignored', () {
      expect(mergeDirectoryRows((const [], [<String, dynamic>{'nameAr': 'x'}])), isEmpty);
    });
  });

  group('search', () {
    final directory = _directory([
      _row('1', 'بنادول 500 ملغ', manufacturer: 'غلاكسو', nameEn: 'Panadol 500', ingredient: 'PARACETAMOL'),
      _row('2', 'سيتامول 500', manufacturer: 'ألفا للأدوية', ingredient: 'PARACETAMOL'),
      _row('3', 'أموكسيل', manufacturer: 'بيتا', ingredient: 'AMOXICILLIN'),
    ]);

    List<String> ids(String query) => directory.search(query).map((i) => i.id).toList()..sort();

    test('an empty query is everything', () {
      expect(directory.search('  '), hasLength(3));
    });

    test('finds by Arabic name, English name and company', () {
      expect(ids('بنادول'), ['1']);
      expect(ids('panadol'), ['1']);
      expect(ids('غلاكسو'), ['1']);
    });

    test('folds hamza and ta marbuta like the server', () {
      expect(ids('اموكسيل'), ['3']);
      expect(ids('أموكسيل'), ['3']);
      expect(ids('الفا للادويه'), ['2']);
    });

    test('every word has to match, in any order', () {
      expect(ids('500 بنادول'), ['1']);
      expect(ids('500'), ['1', '2']);
      expect(ids('500 اموكسيل'), isEmpty);
    });

    test('finds by active ingredient from three letters on, not before', () {
      expect(ids('paracetamol'), ['1', '2']);
      expect(ids('para'), ['1', '2']);
      expect(ids('pa'), ['1'], reason: 'two letters are matched in names only (Panadol), not ingredients');
    });
  });

  group('alternativesOf', () {
    final directory = _directory([
      _row('1', 'بنادول', ingredient: 'PARACETAMOL', strength: '500 MG/TAB.', form: 'أقراص'),
      _row('2', 'سيتامول', ingredient: 'PARACETAMOL', strength: '500 MG/CTD TAB.', form: 'أقراص ملبسة'),
      _row('3', 'اكامول', ingredient: 'PARACETAMOL', strength: '1000 MG/TAB.', form: 'أقراص'),
      _row('4', 'شراب', ingredient: 'PARACETAMOL', strength: '500 MG/TAB.', form: 'شراب'),
      _row('5', 'بلا مادة'),
    ]);
    DirectoryItem byId(String id) => directory.items.firstWhere((i) => i.id == id);

    test('same ingredient, strength and kind of form - plain and coated tablets count as one', () {
      expect(directory.alternativesOf(byId('1')).map((i) => i.id), ['2']);
    });

    test('a medicine that does not say its ingredient has none', () {
      expect(directory.alternativesOf(byId('5')), isEmpty);
    });
  });

  test('saved and read back it is the same list', () {
    final directory = _directory([_row('1', 'أ', ingredient: 'X')]);
    final back = MedicineDirectory.fromEntry(directory.savedAt, {'serverTime': 'T', 'items': directory.rows});
    expect(back!.length, 1);
    expect(back.serverTime, 'T');
    expect(back.items.first.activeIngredient, 'X');
    expect(MedicineDirectory.fromEntry(DateTime.now(), 'garbage'), isNull);
    expect(MedicineDirectory.fromEntry(DateTime.now(), {'items': 5}), isNull);
  });

  test('empty fields read as missing, and the detail line joins what is known', () {
    final item = DirectoryItem({'id': '1', 'nameAr': 'x', 'manufacturerAr': 'y', 'strength': '  ', 'activeIngredient': 'Z'});
    expect(item.strength, isNull);
    expect(item.hasDetails, isTrue);
    expect(item.detailsLine, 'Z');
  });
}
