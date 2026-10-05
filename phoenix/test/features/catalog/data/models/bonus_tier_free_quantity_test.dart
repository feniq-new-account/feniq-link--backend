import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';

// Must give exactly what the server's utils/bonus.js freeQuantityFor gives
// (backend/test/bonus.test.js carries the same cases).
void main() {
  test('the bonus is proportional to the quantity, rounded to whole units', () {
    const tenFour = [BonusTier(buy: 10, free: 4)];
    expect(BonusTier.freeQuantity(tenFour, 5), 2);
    expect(BonusTier.freeQuantity(tenFour, 10), 4);
    expect(BonusTier.freeQuantity(tenFour, 1), 0);
    expect(BonusTier.freeQuantity(tenFour, 2), 1);
    expect(BonusTier.freeQuantity(const [BonusTier(buy: 10, free: 1)], 25), 3);
    expect(BonusTier.freeQuantity(const [BonusTier(buy: 1, free: 1)], 7), 7);
    const two = [BonusTier(buy: 10, free: 1), BonusTier(buy: 20, free: 3)];
    expect(BonusTier.freeQuantity(two, 45), 7);
    expect(BonusTier.freeQuantity(two, 19), 2);
    expect(BonusTier.freeQuantity(two, 9), 1);
    expect(BonusTier.freeQuantity(const [], 100), 0);
  });
}
