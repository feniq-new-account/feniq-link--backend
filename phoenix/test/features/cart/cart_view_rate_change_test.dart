import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/cart/data/models/cart_quote.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/cart/presentation/views/cart_view.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/exchange_rate/data/models/exchange_rate_model.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/route_names.dart';

import '../../helpers/cart_quote_stub.dart';

class _MockOrderRepository extends Mock implements OrderRepository {}

class _MockWarehouseRepository extends Mock implements WarehouseRepository {}

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

ProductModel _product(String id) => ProductModel(
  id: id,
  nameAr: 'دواء $id',
  nameEn: 'Product $id',
  manufacturerAr: 'شركة',
  manufacturerEn: 'Pharma',
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

// The cart screen after a RATE_CHANGED refusal: the order was converted at a
// rate that has since moved, so the pharmacist is shown what the same cart now
// comes to and asked again. Nothing is resent on its own.
//
// Both totals are the SERVER's: the cart is re-quoted at the new rate, and the
// old total is the quote that was on screen - each with the platform discount
// (4% here) in it, and a discount code's when one is applied. 2 x $10:
//   at 1,000 SYP/$  20,000 - 800 platform   = 19,200 (on screen)
//   at 1,200 SYP/$  24,000 - 960 platform   = 23,040 (now)
void main() {
  late CartCubit cartCubit;
  late ExchangeRateCubit rateCubit;
  late _MockOrderRepository orderRepo;
  late _MockExchangeRateRepository rateRepo;
  // The rate each submit carried, in order.
  late List<double?> sentRates;
  // The rate "the server" prices quotes at; the refusal is where it moves.
  late double serverRate;

  setUpAll(() {
    registerFallbackValue(<CartItem>[]);
  });

  setUp(() async {
    sentRates = [];
    serverRate = 1000;
    orderRepo = _MockOrderRepository();
    stubCartQuote(orderRepo, usdToSyp: () => serverRate, platformPercent: 4);
    var calls = 0;
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
    ).thenAnswer((invocation) async {
      sentRates.add(invocation.namedArguments[#rateUsed] as double?);
      calls += 1;
      if (calls == 1) {
        // The rate moved on the server after the cart was quoted; the refusal
        // exactly as exchangeRate.service.js builds it.
        serverRate = 1200;
        throw ServerFailure(
          'The exchange rate changed since this amount was converted.',
          code: 'RATE_CHANGED',
          details: {'rateUsed': 1000, 'currentUsdToSyp': 1200},
          statusCode: 409,
        );
      }
      return _placedOrder;
    });

    final warehouseRepo = _MockWarehouseRepository();
    when(
      () => warehouseRepo.getWarehouseProfile(any()),
    ).thenAnswer((_) async => throw Exception('limits fetch not exercised here'));
    cartCubit = CartCubit(orderRepository: orderRepo, warehouseRepository: warehouseRepo);

    // The rate the screen is showing: 1 USD = 1,000 SYP.
    rateRepo = _MockExchangeRateRepository();
    when(() => rateRepo.getExchangeRate())
        .thenAnswer((_) async => const ExchangeRateModel(usdToSyp: 1000));
    rateCubit = ExchangeRateCubit(exchangeRateRepository: rateRepo);
    await rateCubit.load();

    cartCubit.addProduct(_product('p1'), warehouseId: 'A', warehouseName: 'Warehouse A', quantity: 2);
  });

  tearDown(() {
    cartCubit.close();
    rateCubit.close();
  });

  Future<void> pumpCart(WidgetTester tester, {Locale locale = const Locale('en')}) async {
    final router = GoRouter(
      initialLocation: '/cart',
      routes: [
        GoRoute(
          path: '/cart',
          name: RouteNames.cart,
          builder: (context, state) => const CartView(),
        ),
        GoRoute(
          path: '/orders/:orderId',
          name: RouteNames.orderTracking,
          builder: (context, state) =>
              Scaffold(body: Text('tracking ${state.pathParameters['orderId']}')),
        ),
      ],
    );

    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<CartCubit>.value(value: cartCubit),
          BlocProvider<ExchangeRateCubit>.value(value: rateCubit),
        ],
        child: MaterialApp.router(
          locale: locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder inDialog(String text) =>
      find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

  Future<void> tapSubmitButton(WidgetTester tester) async {
    final button = find.text('Submit order').first;
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  // Submit through the ordinary confirmation, which the server refuses on the
  // rate.
  Future<void> submitIntoRateChange(WidgetTester tester) async {
    await tapSubmitButton(tester);
    expect(find.text('Submit order?'), findsOneWidget);
    await tester.tap(inDialog('Submit order'));
    await tester.pumpAndSettle();
  }

  testWidgets('the submit carries the rate the screen is showing', (tester) async {
    await pumpCart(tester);

    await submitIntoRateChange(tester);

    expect(sentRates, [1000.0]);
  });

  testWidgets('the refusal opens a dialog with both totals from the server, platform discount included', (tester) async {
    await pumpCart(tester);
    expect(find.byKey(const Key('cartTotal')), findsOneWidget);
    expect(find.text('19,200 SYP'), findsOneWidget, reason: 'the server\'s total is on screen before submitting');

    await submitIntoRateChange(tester);

    expect(find.text('The exchange rate changed'), findsOneWidget);
    expect(
      find.text(
        'Your order comes to 23,040 SYP at the new rate, instead of 19,200 SYP.\n\n'
        'Submit again to place the order at the new rate.',
      ),
      findsOneWidget,
    );
    expect(inDialog('Submit order'), findsOneWidget);
    expect(inDialog('Close'), findsOneWidget);
  });

  testWidgets('the refusal re-reads the rate, so every screen stops showing the old one', (tester) async {
    await pumpCart(tester);
    // Once for the setUp load; the refusal is what triggers the second.
    verify(() => rateRepo.getExchangeRate()).called(1);

    await submitIntoRateChange(tester);

    verify(() => rateRepo.getExchangeRate()).called(1);
  });

  testWidgets('closing the dialog sends nothing, and the submit button brings it back', (tester) async {
    await pumpCart(tester);
    await submitIntoRateChange(tester);

    await tester.tap(inDialog('Close'));
    await tester.pumpAndSettle();

    expect(sentRates, hasLength(1), reason: 'nothing resent on its own');

    await tapSubmitButton(tester);
    // The ordinary confirmation again - the cart itself is unchanged, so this
    // is the normal path, and it is still the pharmacist who decides.
    expect(find.text('Submit order?'), findsOneWidget);
    expect(sentRates, hasLength(1));
  });

  testWidgets('confirming resends once, at the new rate, and the order goes through', (tester) async {
    await pumpCart(tester);
    await submitIntoRateChange(tester);

    await tester.tap(inDialog('Submit order'));
    await tester.pumpAndSettle();

    expect(sentRates, [1000.0, 1200.0]);
    expect(find.text('tracking o1'), findsOneWidget);
  });

  testWidgets('the cart and its idempotency key survive the refusal', (tester) async {
    await pumpCart(tester);

    await submitIntoRateChange(tester);

    // Nothing about what is ordered changed, so the cart is untouched and the
    // key stands - the confirmed resubmit is still the same order to the
    // server (order.service.js keeps rateUsed out of the fingerprint).
    expect(cartCubit.state.items.single.productId, 'p1');
    expect(cartCubit.state.items.single.quantity, 2);
    expect(cartCubit.state.hasUnconfirmedPriceChanges, isFalse);
    expect(cartCubit.state.pendingIdempotencyKey, isNotNull);

    final key = cartCubit.state.pendingIdempotencyKey;
    await tester.tap(inDialog('Submit order'));
    await tester.pumpAndSettle();

    verify(
      () => orderRepo.submitOrder(
        warehouseId: any(named: 'warehouseId'),
        items: any(named: 'items'),
        notes: any(named: 'notes'),
        idempotencyKey: key,
        rateUsed: 1200.0,
      ),
    ).called(1);
  });

  testWidgets('in Arabic too', (tester) async {
    await pumpCart(tester, locale: const Locale('ar'));

    await tester.tap(find.text('إرسال الطلب').first);
    await tester.pumpAndSettle();
    await tester.tap(inDialog('إرسال الطلب'));
    await tester.pumpAndSettle();

    expect(find.text('تغيّر سعر الصرف'), findsOneWidget);
    expect(
      find.text(
        'مجموع طلبك بالسعر الجديد 23,040 ل.س بدل 19,200 ل.س.\n\n'
        'أرسل الطلب مرة أخرى لتأكيده بالسعر الجديد.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('with a discount code applied, both totals have the code discount in them too', (tester) async {
    // The same quotes, plus a 10% code taken off what the platform discount
    // leaves: 19,200 - 1,920 = 17,280 on screen; 23,040 - 2,304 = 20,736 now.
    when(
      () => orderRepo.quoteCart(
        warehouseId: any(named: 'warehouseId'),
        items: any(named: 'items'),
        code: any(named: 'code'),
      ),
    ).thenAnswer((invocation) async {
      final base = quoteForItems(
        invocation.namedArguments[#items] as List<CartItem>,
        usdToSyp: serverRate,
        platformPercent: 4,
      );
      final code = invocation.namedArguments[#code] as String?;
      if (code == null) return base;
      final discount = (base.preCodeSyp * 10 / 100).round();
      return CartQuote(
        code: code,
        type: 'percentage',
        value: 10,
        revision: 1,
        subtotalSyp: base.subtotalSyp,
        platformDiscountSyp: base.platformDiscountSyp,
        preCodeSyp: base.preCodeSyp,
        discountSyp: discount,
        finalSyp: base.preCodeSyp - discount,
        usdToSyp: serverRate,
      );
    });
    await pumpCart(tester);
    await cartCubit.applyDiscountCode('ABCD2345');
    await tester.pumpAndSettle();
    expect(find.text('17,280 SYP'), findsOneWidget);

    await submitIntoRateChange(tester);

    expect(
      find.text(
        'Your order comes to 20,736 SYP at the new rate, instead of 17,280 SYP.\n\n'
        'Submit again to place the order at the new rate.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('without a fresh quote there are no totals to show, and nothing is resent from the dialog', (tester) async {
    await pumpCart(tester);
    // The re-quote after the refusal fails on the network.
    when(
      () => orderRepo.quoteCart(
        warehouseId: any(named: 'warehouseId'),
        items: any(named: 'items'),
        code: any(named: 'code'),
      ),
    ).thenAnswer((_) async => throw ServerFailure('offline', code: 'NETWORK_ERROR'));

    await submitIntoRateChange(tester);

    expect(find.text('The exchange rate changed'), findsOneWidget);
    expect(inDialog("Couldn't work out the total."), findsOneWidget);
    expect(inDialog('Submit order'), findsNothing);
    await tester.tap(inDialog('Close'));
    await tester.pumpAndSettle();
    // The summary offers the retry; the submit button waits for real figures.
    expect(find.byKey(const Key('cartQuoteRetry')), findsOneWidget);
    expect(sentRates, hasLength(1));
  });
}
