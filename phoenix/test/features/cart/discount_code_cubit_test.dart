import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/cart/data/models/cart_quote.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';

class _MockOrderRepository extends Mock implements OrderRepository {}

class _MockWarehouseRepository extends Mock implements WarehouseRepository {}

ProductModel _product(String id) => ProductModel(
  id: id,
  nameAr: 'دواء $id',
  manufacturerAr: 'شركة',
  priceUsd: 10,
  discountPriceUsd: 10,
  isAvailable: true,
  hasActiveOffer: false,
);

const _placedOrder = OrderModel(
  id: 'o1',
  orderNumber: 1,
  status: 'pending',
  totalPrice: 0,
  discountAmount: 0,
  commissionAmount: 0,
  finalPrice: 0,
);

// The server's quote without a code: 2 x $10 at 1,000 SYP/$ less 4%.
const _plainQuote = CartQuote(
  subtotalSyp: 20000,
  platformDiscountSyp: 800,
  preCodeSyp: 19200,
  finalSyp: 19200,
  usdToSyp: 1000,
);

CartQuote _codeQuote({int revision = 1, int discount = 1920, num value = 10}) => CartQuote(
  code: 'ABCD2345',
  type: 'percentage',
  value: value,
  revision: revision,
  subtotalSyp: 20000,
  platformDiscountSyp: 800,
  preCodeSyp: 19200,
  discountSyp: discount,
  finalSyp: 19200 - discount,
  usdToSyp: 1000,
);

ServerFailure _refusal(String code, {Map<String, dynamic>? details, int status = 400}) =>
    ServerFailure('refused', code: code, details: details, statusCode: status);

// A little past the re-quote debounce.
Future<void> _settle() => Future<void>.delayed(kCartQuoteDelay + const Duration(milliseconds: 80));

void main() {
  setUpAll(() {
    registerFallbackValue(<CartItem>[]);
  });

  late _MockOrderRepository orderRepo;
  late CartCubit cubit;
  // The code each quote carried (null: quoted without one), in order.
  late List<String?> quotedCodes;
  // What the next quote WITH a code answers (a quote, or a Failure to throw).
  late List<Object> codeAnswers;
  // What the next quote WITHOUT a code answers; the plain quote by default.
  late List<Object> plainAnswers;

  setUp(() async {
    orderRepo = _MockOrderRepository();
    final warehouseRepo = _MockWarehouseRepository();
    when(() => warehouseRepo.getWarehouseProfile(any())).thenAnswer((_) async => throw Exception('not exercised'));
    quotedCodes = [];
    codeAnswers = [];
    plainAnswers = [];
    when(
      () => orderRepo.quoteCart(
        warehouseId: any(named: 'warehouseId'),
        items: any(named: 'items'),
        code: any(named: 'code'),
      ),
    ).thenAnswer((invocation) async {
      final code = invocation.namedArguments[#code] as String?;
      quotedCodes.add(code);
      final queue = code == null ? plainAnswers : codeAnswers;
      final answer = queue.isNotEmpty ? queue.removeAt(0) : (code == null ? _plainQuote : _codeQuote());
      if (answer is Failure) throw answer;
      return answer as CartQuote;
    });
    cubit = CartCubit(orderRepository: orderRepo, warehouseRepository: warehouseRepo);
    cubit.addProduct(_product('p1'), warehouseId: 'A', warehouseName: 'Warehouse A', quantity: 2);
  });

  tearDown(() => cubit.close());

  // The cart screen opening (CartView attaches in initState).
  Future<void> openCartScreen() async {
    cubit.attachQuoteView();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
  }

  void stubSubmit(Future<OrderModel> Function(Invocation invocation) answer) {
    when(
      () => orderRepo.submitOrder(
        warehouseId: any(named: 'warehouseId'),
        items: any(named: 'items'),
        notes: any(named: 'notes'),
        idempotencyKey: any(named: 'idempotencyKey'),
        rateUsed: any(named: 'rateUsed'),
        discountCode: any(named: 'discountCode'),
        discountCodeRevision: any(named: 'discountCodeRevision'),
      ),
    ).thenAnswer(answer);
  }

  group('the quote on every cart', () {
    test('nothing is quoted until the cart screen shows; opening it quotes the cart, without a code', () async {
      cubit.updateQuantity(cubit.state.items.single.lineKey, 3);
      await _settle();
      expect(quotedCodes, isEmpty, reason: 'edits from the catalog cost no quotes');
      expect(cubit.state.isQuoteStale, isTrue);

      await openCartScreen();
      expect(quotedCodes, [null]);
      expect(cubit.state.quote?.finalSyp, 19200);
      expect(cubit.state.hasCurrentQuote, isTrue);
      expect(cubit.state.isReadyToSubmit, isTrue);
    });

    test('while the screen shows, edits re-quote once they settle, and hold the submit meanwhile', () async {
      await openCartScreen();
      quotedCodes.clear();
      final key = cubit.state.items.single.lineKey;
      cubit.updateQuantity(key, 3);
      cubit.updateQuantity(key, 4);

      expect(cubit.state.isQuoting, isTrue);
      expect(cubit.state.isReadyToSubmit, isFalse, reason: 'the total on screen is not current yet');
      await _settle();
      expect(quotedCodes, [null], reason: 'two taps, one request');
      expect(cubit.state.isReadyToSubmit, isTrue);

      cubit.detachQuoteView();
      cubit.updateQuantity(key, 5);
      await _settle();
      expect(quotedCodes, [null], reason: 'the screen is gone');
    });

    test('an edit is one emit: the quote goes stale in the same state as the edit', () async {
      await openCartScreen();
      final emitted = [];
      final sub = cubit.stream.listen(emitted.add);
      cubit.updateQuantity(cubit.state.items.single.lineKey, 3);
      await Future<void>.delayed(Duration.zero);
      expect(emitted, hasLength(1));
      expect(emitted.single.isQuoteStale, isTrue);
      await sub.cancel();
      await _settle();
    });

    test('a failed quote leaves a retry, and the submit waits for real figures', () async {
      plainAnswers.add(_refusal('NETWORK_ERROR', status: 0));
      await openCartScreen();
      expect(cubit.state.quoteErrorCode, 'NETWORK_ERROR');
      expect(cubit.state.isReadyToSubmit, isFalse);

      await cubit.refreshQuote();
      expect(cubit.state.quoteErrorCode, isNull);
      expect(cubit.state.isReadyToSubmit, isTrue);
    });

    test('a new cart on a screen already showing is quoted at once', () async {
      await openCartScreen();
      quotedCodes.clear();
      cubit.addProduct(_product('p9'), warehouseId: 'B', warehouseName: 'Warehouse B', quantity: 1);
      await Future<void>.delayed(Duration.zero);
      expect(quotedCodes, [null]);
    });
  });

  group('applying a code', () {
    setUp(openCartScreen);

    test('a code that works is applied with the server\'s quote, typed in any case', () async {
      await cubit.applyDiscountCode('  abcd2345 ');

      expect(quotedCodes.last, 'ABCD2345');
      expect(cubit.state.discountCode, 'ABCD2345');
      expect(cubit.state.quote?.discountSyp, 1920);
      expect(cubit.state.isQuoting, isFalse);
      expect(cubit.state.discountCodeErrorCode, isNull);
      expect(cubit.state.isReadyToSubmit, isTrue);
    });

    test('a refused code leaves the cart and its quote as they were, with the reason for the field', () async {
      codeAnswers.add(_refusal('DISCOUNT_CODE_EXPIRED'));
      await cubit.applyDiscountCode('ABCD2345');

      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.discountCodeErrorCode, 'DISCOUNT_CODE_EXPIRED');
      expect(cubit.state.quote?.finalSyp, 19200, reason: 'the code-less quote still stands');
      expect(cubit.state.isReadyToSubmit, isTrue);
    });

    test('an empty field sends nothing', () async {
      final before = quotedCodes.length;
      await cubit.applyDiscountCode('   ');
      expect(quotedCodes, hasLength(before));
    });

    test('applying and removing a code both drop the pending idempotency key; removing re-quotes without it', () async {
      stubSubmit((_) async => throw _refusal('NETWORK'));
      await cubit.submitOrder();
      expect(cubit.state.pendingIdempotencyKey, isNotNull);

      await cubit.applyDiscountCode('ABCD2345');
      expect(cubit.state.pendingIdempotencyKey, isNull, reason: 'the order now carries a code');

      await cubit.submitOrder();
      expect(cubit.state.pendingIdempotencyKey, isNotNull);
      cubit.removeDiscountCode();
      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.pendingIdempotencyKey, isNull, reason: 'the order no longer carries it');
      await Future<void>.delayed(Duration.zero);
      expect(quotedCodes.last, isNull);
      expect(cubit.state.quote?.hasCode, isFalse);
      expect(cubit.state.quote?.finalSyp, 19200);
    });

    test('an answer for a cart that has since been replaced is dropped', () async {
      final slow = Completer<CartQuote>();
      when(
        () => orderRepo.quoteCart(
          warehouseId: any(named: 'warehouseId'),
          items: any(named: 'items'),
          code: any(named: 'code'),
        ),
      ).thenAnswer((invocation) => invocation.namedArguments[#code] == null ? Future.value(_plainQuote) : slow.future);

      final pending = cubit.applyDiscountCode('ABCD2345');
      cubit.addProduct(_product('p9'), warehouseId: 'B', warehouseName: 'Warehouse B', quantity: 1);
      slow.complete(_codeQuote());
      await pending;
      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.warehouseId, 'B');
    });
  });

  group('re-quoting a cart with a code', () {
    setUp(() async {
      await openCartScreen();
      await cubit.applyDiscountCode('ABCD2345');
      quotedCodes.clear();
    });

    test('quantity edits re-quote with the code', () async {
      codeAnswers.add(_codeQuote(discount: 2880));
      cubit.updateQuantity(cubit.state.items.single.lineKey, 3);
      expect(cubit.state.isReadyToSubmit, isFalse);
      await _settle();
      expect(quotedCodes, ['ABCD2345']);
      expect(cubit.state.quote?.discountSyp, 2880);
      expect(cubit.state.isReadyToSubmit, isTrue);
    });

    test('a code that stopped working meanwhile comes off with its reason, and the cart is quoted without it', () async {
      codeAnswers.add(_refusal('DISCOUNT_CODE_STOPPED'));
      cubit.updateQuantity(cubit.state.items.single.lineKey, 5);
      await _settle();

      expect(quotedCodes, ['ABCD2345', null]);
      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.discountCodeErrorCode, 'DISCOUNT_CODE_STOPPED');
      expect(cubit.state.quote?.hasCode, isFalse);
      expect(cubit.state.isReadyToSubmit, isTrue);
    });

    test('a network failure keeps the code, with no figures until a retry', () async {
      codeAnswers.add(_refusal('NETWORK_ERROR', status: 0));
      cubit.updateQuantity(cubit.state.items.single.lineKey, 5);
      await _settle();

      expect(cubit.state.discountCode, 'ABCD2345');
      expect(cubit.state.quoteErrorCode, 'NETWORK_ERROR');
      expect(cubit.state.canSubmit, isFalse, reason: 'a code needs its current quote');

      await cubit.refreshQuote();
      expect(cubit.state.hasCurrentQuote, isTrue);
      expect(cubit.state.isReadyToSubmit, isTrue);
    });

    test('a cart at another warehouse has no code; the code stays with its own cart', () async {
      cubit.addProduct(_product('p9'), warehouseId: 'B', warehouseName: 'Warehouse B', quantity: 1);
      await _settle();
      expect(cubit.state.discountCode, isNull);
      expect(quotedCodes.where((c) => c != null), isEmpty);
      expect(cubit.state.otherCarts['A']!.discountCode, 'ABCD2345');
    });
  });

  group('submitting with a code', () {
    setUp(() async {
      await openCartScreen();
      await cubit.applyDiscountCode('ABCD2345');
    });

    test('the code and the revision it was quoted at go with the order', () async {
      Invocation? sent;
      stubSubmit((invocation) async {
        sent = invocation;
        return _placedOrder;
      });

      final order = await cubit.submitOrder();
      expect(order, isNotNull);
      expect(sent!.namedArguments[#discountCode], 'ABCD2345');
      expect(sent!.namedArguments[#discountCodeRevision], 1);
      expect(cubit.state.discountCode, isNull, reason: 'a placed order empties the cart');
    });

    test('a code that stopped working is taken off, and nothing was ordered', () async {
      stubSubmit((_) async => throw _refusal(
            'DISCOUNT_CODE_CHANGED',
            details: {'reason': 'DISCOUNT_CODE_STOPPED', 'code': 'ABCD2345'},
            status: 409,
          ));

      final order = await cubit.submitOrder();
      expect(order, isNull);
      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.discountCodeErrorCode, 'DISCOUNT_CODE_STOPPED');
      expect(cubit.state.errorCode, 'DISCOUNT_CODE_CHANGED');
      expect(cubit.state.errorDetails?['reason'], 'DISCOUNT_CODE_STOPPED');
      expect(cubit.state.pendingIdempotencyKey, isNull, reason: 'the next order no longer carries the code');
      expect(cubit.state.isSubmitting, isFalse);
      await Future<void>.delayed(Duration.zero);
      expect(cubit.state.quote?.hasCode, isFalse, reason: 'quoted again without the code');
    });

    test('a code whose amount changed is re-quoted, and the next submit carries the new revision', () async {
      final revisions = <Object?>[];
      var calls = 0;
      stubSubmit((invocation) async {
        revisions.add(invocation.namedArguments[#discountCodeRevision]);
        calls += 1;
        if (calls == 1) {
          throw _refusal(
            'DISCOUNT_CODE_CHANGED',
            details: {'reason': 'DISCOUNT_CODE_EDITED', 'code': 'ABCD2345', 'type': 'percentage', 'value': 5, 'revision': 2},
            status: 409,
          );
        }
        return _placedOrder;
      });
      codeAnswers.add(_codeQuote(revision: 2, value: 5, discount: 960));

      expect(await cubit.submitOrder(), isNull);
      expect(cubit.state.discountCode, 'ABCD2345', reason: 'the code still works');
      expect(cubit.state.quote?.revision, 2);
      expect(cubit.state.quote?.finalSyp, 18240);
      expect(cubit.state.errorCode, 'DISCOUNT_CODE_CHANGED');
      expect(cubit.state.pendingIdempotencyKey, isNotNull, reason: 'the same code goes again - the key stays');

      expect(await cubit.submitOrder(), isNotNull);
      expect(revisions, [1, 2]);
    });

    test('a code refused at submit without a preview is taken off too', () async {
      stubSubmit((_) async => throw _refusal('DISCOUNT_CODE_LIMIT_REACHED'));
      await cubit.submitOrder();
      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.discountCodeErrorCode, 'DISCOUNT_CODE_LIMIT_REACHED');
    });

    test('nothing is sent while a quote is in the air', () async {
      stubSubmit((_) async => _placedOrder);
      cubit.updateQuantity(cubit.state.items.single.lineKey, 7);
      expect(await cubit.submitOrder(), isNull);
      verifyNever(
        () => orderRepo.submitOrder(
          warehouseId: any(named: 'warehouseId'),
          items: any(named: 'items'),
          notes: any(named: 'notes'),
          idempotencyKey: any(named: 'idempotencyKey'),
          rateUsed: any(named: 'rateUsed'),
          discountCode: any(named: 'discountCode'),
          discountCodeRevision: any(named: 'discountCodeRevision'),
        ),
      );
      await _settle();
    });
  });

  group('a rate that moved at submit', () {
    setUp(openCartScreen);

    test('the refusal carries both totals from the server - the one on screen and a fresh quote', () async {
      stubSubmit((_) async => throw _refusal(
            'RATE_CHANGED',
            details: {'rateUsed': 1000, 'currentUsdToSyp': 1200},
            status: 409,
          ));
      plainAnswers.add(const CartQuote(
        subtotalSyp: 24000,
        platformDiscountSyp: 960,
        preCodeSyp: 23040,
        finalSyp: 23040,
        usdToSyp: 1200,
      ));

      expect(await cubit.submitOrder(rateUsed: 1000), isNull);
      expect(cubit.state.errorCode, 'RATE_CHANGED');
      expect(cubit.state.errorDetails?['previousTotalSyp'], 19200);
      expect(cubit.state.errorDetails?['currentTotalSyp'], 23040);
      expect(cubit.state.quote?.usdToSyp, 1200, reason: 'the new figures are on screen');
      expect(cubit.state.pendingIdempotencyKey, isNotNull, reason: 'nothing about the order changed');
    });
  });
}
