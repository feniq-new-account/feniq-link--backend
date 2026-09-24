import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/utils/pricing.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';

// Catalog overhaul Phase 7: the app shows the lira price the order charges.
// The golden values below come straight from the backend's
// manufacturerDiscount.service.js computeFinalPrice - the Dart port must match
// them exactly.
void main() {
  group('finalPriceSypAt matches the server', () {
    const cases = [
      // priceUsd, offer %, manufacturer %, rate, server finalSyp
      (2, 10, 2.5, 100.0, 176),
      (1.37, 15, 2.5, 13130.0, 14908),
      (0.99, 33, null, 13500.0, 8955),
      (12.345, null, 7, 12999.0, 149240),
      (5, 100, 50, 13000.0, 0),
    ];
    for (final (price, offer, manufacturer, rate, expected) in cases) {
      test('\$$price, offer $offer%, manufacturer $manufacturer% at $rate -> $expected', () {
        expect(
          finalPriceSypAt(
            priceUsd: price,
            offerPercentage: offer,
            manufacturerDiscountPercentage: manufacturer,
            usdToSyp: rate,
          ),
          expected,
        );
      });
    }
  });

  group('displayedPriceSyp', () {
    test('uses the server figure when it was priced at the current rate', () {
      expect(
        displayedPriceSyp(priceUsd: 1.37, discountPriceUsd: 1.14, serverPriceSyp: 14908, serverRate: 13130, usdToSyp: 13130),
        14908,
      );
    });

    test('recomputes exactly when the rate moved', () {
      expect(
        displayedPriceSyp(
          priceUsd: 2,
          discountPriceUsd: 1.76,
          serverPriceSyp: 999,
          serverRate: 90,
          offerPercentage: 10,
          manufacturerDiscountPercentage: 2.5,
          hasDiscountInputs: true,
          usdToSyp: 100,
        ),
        176,
      );
    });

    test('falls back to the plain conversion for an older backend', () {
      expect(displayedPriceSyp(priceUsd: 2, discountPriceUsd: 1.76, usdToSyp: 100), 176);
      expect(displayedPriceSyp(priceUsd: 2, discountPriceUsd: 1.76, usdToSyp: null), isNull);
    });
  });

  test('a product and its cart line show the server lira price, and the line total follows it', () {
    final product = ProductModel.fromJson({
      'id': 'p1',
      'nameAr': 'دواء',
      'manufacturerAr': 'شركة',
      'priceUsd': 1.37,
      'discountPriceUsd': 1.14,
      'isAvailable': true,
      'offer': {'discountPercentage': 15},
      'finalPriceSyp': 14908,
      'priceRate': 13130,
      'offerDiscountPercentage': 15,
      'manufacturerDiscountPercentage': 2.5,
      'bonuses': [
        {'buy': 10, 'free': 1},
      ],
    });
    expect(product.finalSypAt(13130), 14908);
    final line = CartItem.fromProduct(product, quantity: 25);
    expect(line.lineTotalSypAt(13130), 14908 * 25);
    expect(line.freeQuantity, 2);
    expect(line.bonuses, const [BonusTier(buy: 10, free: 1)]);
  });

  test('a product row with no name or manufacturer does not throw', () {
    final product = ProductModel.fromJson({
      'id': 'p2',
      'nameAr': null,
      'nameEn': 'Name',
      'priceUsd': 1,
      'discountPriceUsd': 1,
      'isAvailable': true,
    });
    expect(product.nameAr, 'Name');
    expect(product.manufacturerAr, '');
    expect(product.bonuses, isEmpty);
  });
}
