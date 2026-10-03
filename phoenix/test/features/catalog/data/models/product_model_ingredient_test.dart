import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';

Map<String, dynamic> _json({Map<String, dynamic> extra = const {}}) => {
  'id': 'p1',
  'nameAr': 'بنادول 500',
  'manufacturerAr': 'ألفا',
  'priceUsd': 3,
  'discountPriceUsd': 3,
  'isAvailable': true,
  'offer': null,
  ...extra,
};

void main() {
  group('ProductModel active ingredient', () {
    test('reads the ingredient and strength the server sends', () {
      final product = ProductModel.fromJson(
        _json(extra: {'activeIngredient': 'PARACETAMOL', 'strength': '500 MG/TAB.'}),
      );
      expect(product.activeIngredient, 'PARACETAMOL');
      expect(product.strength, '500 MG/TAB.');
    });

    test('an older server that sends neither still parses', () {
      final product = ProductModel.fromJson(_json());
      expect(product.activeIngredient, isNull);
      expect(product.strength, isNull);
    });
  });
}
