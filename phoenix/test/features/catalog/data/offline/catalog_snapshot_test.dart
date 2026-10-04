import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/catalog/data/offline/catalog_snapshot.dart';

Map<String, dynamic> _product(
  String id,
  String nameAr, {
  String manufacturer = 'ألفا',
  String? nameEn,
  String? ingredient,
  String? strength,
  String? form,
  num price = 5,
  bool available = true,
  String? categoryId,
}) => {
  'id': id,
  'nameAr': nameAr,
  'nameEn': nameEn,
  'manufacturerAr': manufacturer,
  'categoryId': categoryId,
  'priceUsd': price,
  'discountPriceUsd': price,
  'isAvailable': available,
  'offer': null,
  'activeIngredient': ingredient,
  'strength': strength,
  'dosageForm': form,
};

CatalogSnapshot _snapshot(List<Map<String, dynamic>> products) => CatalogSnapshot(
  warehouseId: 'w1',
  savedAt: DateTime(2026, 10, 4, 12),
  products: products,
  manufacturers: [
    {'manufacturerAr': 'ألفا', 'discountPercentage': 5},
    {'manufacturerAr': 'بحري'},
  ],
);

void main() {
  final panadol = _product('a1', 'PANADOL 500 (20 TAB)', ingredient: 'PARACETAMOL', strength: '500 MG/TAB.', form: 'أقراص');
  final cetamol = _product(
    'a2',
    'CETAMOL 500 (20 TAB)',
    manufacturer: 'بحري',
    ingredient: 'PARACETAMOL',
    strength: '500 MG/CTD TAB.',
    form: 'أقراص ملبسة',
    price: 3,
  );
  final outOfStock = _product(
    'a3',
    'PARAMOL 500 (20 TAB)',
    ingredient: 'PARACETAMOL',
    strength: '500 MG/TAB.',
    form: 'أقراص',
    price: 1,
    available: false,
  );
  final syrup = _product('a4', 'PANADOL SYRUP', ingredient: 'PARACETAMOL', strength: '500 MG/TAB.', form: 'شراب');
  final brufen = _product('a5', 'BRUFEN 400', manufacturer: 'بحري', ingredient: 'IBUPROFEN', strength: '400 MG/TAB.', form: 'أقراص', categoryId: 'c1');
  final all = [panadol, cetamol, outOfStock, syrup, brufen];

  group('query', () {
    test('finds a medicine by its name, its company or its active ingredient', () {
      final snapshot = _snapshot(all);
      expect(snapshot.query(search: 'brufen').items.map((p) => p.id), ['a5']);
      expect(snapshot.query(search: 'بحري').items.map((p) => p.id), ['a2', 'a5']);
      expect(snapshot.query(search: 'paracetamol').items.map((p) => p.id), ['a1', 'a2', 'a3', 'a4']);
    });

    test('a two-letter query does not search the ingredient', () {
      expect(_snapshot(all).query(search: 'pa').items.map((p) => p.id), ['a1', 'a3', 'a4']);
    });

    test('filters by an exact company and by category', () {
      final snapshot = _snapshot(all);
      expect(snapshot.query(manufacturer: 'بحري').items.map((p) => p.id), ['a2', 'a5']);
      expect(snapshot.query(categoryId: 'c1').items.map((p) => p.id), ['a5']);
      expect(snapshot.query(manufacturer: 'غير موجود').items, isEmpty);
    });

    test('pages by the id of the last row', () {
      final snapshot = _snapshot(all);
      final first = snapshot.query(limit: 2);
      expect(first.items.map((p) => p.id), ['a1', 'a2']);
      expect(first.hasMore, isTrue);
      expect(first.nextCursor, 'a2');

      final second = snapshot.query(limit: 2, after: first.nextCursor);
      expect(second.items.map((p) => p.id), ['a3', 'a4']);
      expect(second.hasMore, isTrue);

      final third = snapshot.query(limit: 2, after: second.nextCursor);
      expect(third.items.map((p) => p.id), ['a5']);
      expect(third.hasMore, isFalse);
    });

    test('lists the companies', () {
      final names = _snapshot(all).listManufacturers().map((m) => m.name).toList();
      expect(names, ['ألفا', 'بحري']);
    });
  });

  group('alternativesOf', () {
    test('same ingredient, strength and kind of form; available first, then cheapest', () {
      final result = _snapshot(all).alternativesOf('a1');
      // PARAMOL is out of stock so it comes after CETAMOL, whatever its price.
      expect(result.map((p) => p.id), ['a2', 'a3']);
    });

    test('never lists the medicine itself, another form or another drug', () {
      final result = _snapshot(all).alternativesOf('a1').map((p) => p.id);
      expect(result, isNot(contains('a1')));
      expect(result, isNot(contains('a4')));
      expect(result, isNot(contains('a5')));
    });

    test('a medicine without ingredient data, or an unknown one, has none', () {
      final snapshot = _snapshot([...all, _product('a6', 'MYSTERY')]);
      expect(snapshot.alternativesOf('a6'), isEmpty);
      expect(snapshot.alternativesOf('nope'), isEmpty);
      expect(snapshot.alternativesOf('a5'), isEmpty);
    });
  });

  test('a saved entry round-trips through its JSON', () {
    final original = _snapshot(all);
    final restored = CatalogSnapshot.fromEntry('w1', original.savedAt, original.toJson());
    expect(restored, isNotNull);
    expect(restored!.products.length, 5);
    expect(restored.query(search: 'brufen').items.single.id, 'a5');
  });

  test('a damaged entry is ignored', () {
    expect(CatalogSnapshot.fromEntry('w1', DateTime.now(), 'oops'), isNull);
    expect(CatalogSnapshot.fromEntry('w1', DateTime.now(), {'products': 1}), isNull);
  });
}
