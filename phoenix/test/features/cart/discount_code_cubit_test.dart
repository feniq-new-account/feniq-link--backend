import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/cart/data/models/discount_code_quote.dart';
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

DiscountCodeQuote _quote({int revision = 1, int discount = 2000, int finalSyp = 18000, num value = 10}) =>
    DiscountCodeQuote(
      code: 'ABCD2345',
      type: 'percentage',
      value: value,
      revision: revision,
      subtotalSyp: 20000,
      platformDiscountSyp: 0,
      preCodeSyp: 20000,
      discountSyp: discount,
      finalSyp: finalSyp,
    );

ServerFailure _refusal(String code, {Map<String, dynamic>? details, int status = 400}) =>
    ServerFailure('refused', code: code, details: details, statusCode: status);

// A little past the re-quote debounce.
Future<void> _settle() => Future<void>.delayed(kDiscountRequoteDelay + const Duration(milliseconds: 80));

void main() {
  setUpAll(() {
    registerFallbackValue(<CartItem>[]);
  });

  late _MockOrderRepository orderRepo;
  late CartCubit cubit;
  // Every code previewed, in order.
  late List<String> previewed;
  // What the next preview answers with (a quote, or a Failure to throw).
  late List<Object> previewAnswers;

  setUp(() {
    orderRepo = _MockOrderRepository();
    final warehouseRepo = _MockWarehouseRepository();
    when(() => warehouseRepo.getWarehouseProfile(any())).thenAnswer((_) async => throw Exception('not exercised'));
    previewed = [];
    previewAnswers = [];
    when(
      () => orderRepo.previewDiscountCode(
        warehouseId: any(named: 'warehouseId'),
        items: any(named: 'items'),
        code: any(named: 'code'),
      ),
    ).thenAnswer((invocation) async {
      previewed.add(invocation.namedArguments[#code] as String);
      final answer = previewAnswers.isNotEmpty ? previewAnswers.removeAt(0) : _quote();
      if (answer is Failure) throw answer;
      return answer as DiscountCodeQuote;
    });
    cubit = CartCubit(orderRepository: orderRepo, warehouseRepository: warehouseRepo);
    cubit.addProduct(_product('p1'), warehouseId: 'A', warehouseName: 'Warehouse A', quantity: 2);
  });

  tearDown(() => cubit.close());

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

  group('applying a code', () {
    test('a code that works is applied with the server\'s quote, typed in any case', () async {
      await cubit.applyDiscountCode('  abcd2345 ');

      expect(previewed, ['ABCD2345']);
      expect(cubit.state.discountCode, 'ABCD2345');
      expect(cubit.state.discountQuote?.discountSyp, 2000);
      expect(cubit.state.isQuotingDiscountCode, isFalse);
      expect(cubit.state.discountCodeErrorCode, isNull);
      expect(cubit.state.canSubmit, isTrue);
    });

    test('a refused code leaves the cart as it was, with the reason for the field', () async {
      previewAnswers.add(_refusal('DISCOUNT_CODE_EXPIRED'));
      await cubit.applyDiscountCode('ABCD2345');

      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.discountQuote, isNull);
      expect(cubit.state.discountCodeErrorCode, 'DISCOUNT_CODE_EXPIRED');
      expect(cubit.state.items.single.quantity, 2);
      expect(cubit.state.canSubmit, isTrue);
    });

    test('an empty field sends nothing', () async {
      await cubit.applyDiscountCode('   ');
      expect(previewed, isEmpty);
    });

    test('applying and removing a code both drop the pending idempotency key', () async {
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
    });

    test('an answer that arrives after the code was removed is dropped', () async {
      final pending = cubit.applyDiscountCode('ABCD2345');
      cubit.removeDiscountCode();
      await pending;
      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.isQuotingDiscountCode, isFalse);
    });
  });

  group('re-quoting after edits', () {
    setUp(() async {
      await cubit.applyDiscountCode('ABCD2345');
      previewed.clear();
    });

    test('quantity edits re-quote once they settle, and hold the submit meanwhile', () async {
      previewAnswers.add(_quote(discount: 3000, finalSyp: 27000));
      final key = cubit.state.items.single.lineKey;
      cubit.updateQuantity(key, 3);
      cubit.updateQuantity(key, 4);
      cubit.updateQuantity(key, 3);

      expect(cubit.state.isQuotingDiscountCode, isTrue);
      expect(cubit.state.canSubmit, isFalse, reason: 'the total on screen is not current yet');
      expect(previewed, isEmpty, reason: 'debounced');

      await _settle();
      expect(previewed, ['ABCD2345'], reason: 'three taps, one request');
      expect(cubit.state.discountQuote?.discountSyp, 3000);
      expect(cubit.state.isQuotingDiscountCode, isFalse);
      expect(cubit.state.canSubmit, isTrue);
    });

    test('a same-value edit re-quotes nothing', () async {
      cubit.updateQuantity(cubit.state.items.single.lineKey, 2);
      await _settle();
      expect(previewed, isEmpty);
    });

    test('adding a product and removing a line re-quote too', () async {
      cubit.addProduct(_product('p2'), warehouseId: 'A', warehouseName: 'Warehouse A', quantity: 1);
      await _settle();
      cubit.removeItem(cubit.state.items.last.lineKey);
      await _settle();
      expect(previewed, ['ABCD2345', 'ABCD2345']);
    });

    test('a code that stopped working meanwhile comes off, with the reason', () async {
      previewAnswers.add(_refusal('DISCOUNT_CODE_STOPPED'));
      cubit.updateQuantity(cubit.state.items.single.lineKey, 5);
      await _settle();

      expect(cubit.state.discountCode, isNull);
      expect(cubit.state.discountCodeErrorCode, 'DISCOUNT_CODE_STOPPED');
      expect(cubit.state.canSubmit, isTrue);
    });

    test('a network failure keeps the code without an amount until a retry', () async {
      previewAnswers.add(_refusal('NETWORK_ERROR', status: 0));
      cubit.updateQuantity(cubit.state.items.single.lineKey, 5);
      await _settle();

      expect(cubit.state.discountCode, 'ABCD2345');
      expect(cubit.state.discountQuote, isNull);
      expect(cubit.state.canSubmit, isFalse, reason: 'no amount - nothing to confirm');

      await cubit.refreshDiscountQuote();
      expect(cubit.state.discountQuote, isNotNull);
      expect(cubit.state.canSubmit, isTrue);
    });

    test('a new cart for another warehouse takes the code with the old one', () async {
      cubit.replaceWithProduct(_product('p9'), warehouseId: 'B', warehouseName: 'Warehouse B', quantity: 1);
      await _settle();
      expect(cubit.state.discountCode, isNull);
      expect(previewed, isEmpty);
    });
  });

  group('submitting with a code', () {
    setUp(() async {
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
      previewAnswers.add(_quote(revision: 2, value: 5, discount: 1000, finalSyp: 19000));

      expect(await cubit.submitOrder(), isNull);
      expect(cubit.state.discountCode, 'ABCD2345', reason: 'the code still works');
      expect(cubit.state.discountQuote?.revision, 2);
      expect(cubit.state.discountQuote?.finalSyp, 19000);
      expect(cubit.state.errorCode, 'DISCOUNT_CODE_CHANGED');
      final key = cubit.state.pendingIdempotencyKey;
      expect(key, isNotNull, reason: 'the same code goes again - the key stays, like RATE_CHANGED');

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
}
