import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';
import 'package:feniq/features/offers/data/models/offer_model.dart';

void main() {
  test('a bonus offer is read with its bonus, and puts that bonus in the cart', () {
    final offer = OfferModel.fromJson({
      'id': 'o1',
      'titleAr': 'بونص إضافي',
      'offerType': 'bonus',
      'discountPercentage': 0,
      'bonuses': [
        {'buy': 10, 'free': 3},
      ],
      'regularBonuses': [
        {'buy': 10, 'free': 2},
      ],
      'isPermanent': false,
      'warehouseId': 'w1',
      'warehouseNameAr': 'مستودع',
      'productId': 'p1',
      'nameAr': 'دواء',
      'manufacturerAr': 'شركة',
      'priceUsd': 5,
      'discountPriceUsd': 5,
      'isAvailable': true,
    });
    expect(offer.isBonusOffer, isTrue);
    expect(offer.bonuses, const [BonusTier(buy: 10, free: 3)]);
    expect(offer.regularBonuses, const [BonusTier(buy: 10, free: 2)]);
    expect(offer.toCartProduct().bonuses, const [BonusTier(buy: 10, free: 3)]);
  });
}
