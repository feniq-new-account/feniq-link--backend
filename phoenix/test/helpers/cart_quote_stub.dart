import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/cart/data/models/cart_quote.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';

// The cart screen always shows the server's quote for the cart (and holds its
// submit button until it has one), so every cart-screen test answers
// OrderRepository.quoteCart. These work the figures out the way the server
// does, closely enough for a widget test: each line's own lira total at the
// rate, the platform discount as a percentage of that, no code.

CartQuote quoteForItems(List<CartItem> items, {required double usdToSyp, num platformPercent = 0}) {
  var subtotal = 0;
  for (final item in items) {
    subtotal += item.lineTotalSypAt(usdToSyp) ?? 0;
  }
  final platform = (subtotal * platformPercent / 100).round();
  return CartQuote(
    subtotalSyp: subtotal,
    platformDiscountSyp: platform,
    preCodeSyp: subtotal - platform,
    finalSyp: subtotal - platform,
    usdToSyp: usdToSyp,
  );
}

/// Answers every quote with [quoteForItems], at the rate [usdToSyp] gives at
/// the moment of the call - so a test can move "the server's" rate.
void stubCartQuote(
  OrderRepository repo, {
  required double Function() usdToSyp,
  num platformPercent = 0,
}) {
  when(
    () => repo.quoteCart(
      warehouseId: any(named: 'warehouseId'),
      items: any(named: 'items'),
      code: any(named: 'code'),
    ),
  ).thenAnswer(
    (invocation) async => quoteForItems(
      invocation.namedArguments[#items] as List<CartItem>,
      usdToSyp: usdToSyp(),
      platformPercent: platformPercent,
    ),
  );
}
