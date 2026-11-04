import '../../helpers/launch_fixture.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/config/app_features.dart';
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

// 2 x $10 at 1,000 SYP/$: subtotal 20,000; platform discount 800 (4%);
// 10% code on the 19,200 left = 1,920; total 17,280.
const _plainQuote = CartQuote(
  subtotalSyp: 20000,
  platformDiscountSyp: 800,
  preCodeSyp: 19200,
  finalSyp: 19200,
  usdToSyp: 1000,
);

const _quote = CartQuote(
  code: 'ABCD2345',
  type: 'percentage',
  value: 10,
  revision: 1,
  subtotalSyp: 20000,
  platformDiscountSyp: 800,
  preCodeSyp: 19200,
  discountSyp: 1920,
  finalSyp: 17280,
  usdToSyp: 1000,
);

// The cart summary is always the server's quote, and the discount code rides
// on it: the Apply field, the code's line in the summary, the refusal text
// under the field, and the two ways a submit can be refused over the code
// (DISCOUNT_CODE_CHANGED).
void main() {
  // Hidden in the app for now (AppFeatures); these tests still cover it.
  setUp(() => AppFeatures.discountCodes = true);
  tearDown(() => AppFeatures.discountCodes = false);

  late CartCubit cartCubit;
  late ExchangeRateCubit rateCubit;
  late _MockOrderRepository orderRepo;
  late List<Object> previewAnswers;
  late List<Object> submitAnswers;
  late List<Object?> sentRevisions;

  setUpAll(() {
    registerFallbackValue(<CartItem>[]);
  });

  setUp(() async {
    orderRepo = _MockOrderRepository();
    previewAnswers = [];
    submitAnswers = [];
    sentRevisions = [];
    // Quotes without a code are always the plain one; quotes with a code
    // take their answers from previewAnswers, in order.
    when(
      () => orderRepo.quoteCart(
        warehouseId: any(named: 'warehouseId'),
        items: any(named: 'items'),
        code: any(named: 'code'),
      ),
    ).thenAnswer((invocation) async {
      if (invocation.namedArguments[#code] == null) return _plainQuote;
      final answer = previewAnswers.isNotEmpty ? previewAnswers.removeAt(0) : _quote;
      if (answer is Failure) throw answer;
      return answer as CartQuote;
    });
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
      sentRevisions.add(invocation.namedArguments[#discountCodeRevision]);
      final answer = submitAnswers.isNotEmpty ? submitAnswers.removeAt(0) : _placedOrder;
      if (answer is Failure) throw answer;
      return answer as OrderModel;
    });

    final warehouseRepo = _MockWarehouseRepository();
    when(() => warehouseRepo.getWarehouseProfile(any())).thenAnswer((_) async => throw Exception('not exercised'));
    cartCubit = CartCubit(orderRepository: orderRepo, warehouseRepository: warehouseRepo);

    final rateRepo = _MockExchangeRateRepository();
    when(() => rateRepo.getExchangeRate()).thenAnswer((_) async => const ExchangeRateModel(usdToSyp: 1000));
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
        GoRoute(path: '/cart', name: RouteNames.cart, builder: (context, state) => const CartView(loadLaunchStatus: openLaunchForTest)),
        GoRoute(
          path: '/orders/:orderId',
          name: RouteNames.orderTracking,
          builder: (context, state) => Scaffold(body: Text('tracking ${state.pathParameters['orderId']}')),
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

  Future<void> applyCode(WidgetTester tester, String code) async {
    final field = find.byKey(const Key('discountCodeInput'));
    await tester.ensureVisible(field);
    await tester.enterText(field, code);
    await tester.tap(find.byKey(const Key('discountCodeApply')));
    await tester.pumpAndSettle();
  }

  Finder inDialog(String text) => find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

  Future<void> submitThroughConfirmation(WidgetTester tester) async {
    final button = find.text('Submit order').first;
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
    await tester.tap(inDialog('Submit order'));
    await tester.pumpAndSettle();
  }

  String textOf(WidgetTester tester, String key) => tester.widget<Text>(find.byKey(Key(key))).data!;

  testWidgets('without a code the cart still shows the server\'s figures: subtotal, platform discount, total', (tester) async {
    await pumpCart(tester);
    expect(textOf(tester, 'cartSubtotal'), '20,000 SYP');
    expect(textOf(tester, 'cartPlatformDiscount'), '- 800 SYP');
    expect(textOf(tester, 'cartTotal'), '19,200 SYP');
    expect(find.byKey(const Key('discountCodeAmount')), findsNothing);
    expect(find.byKey(const Key('cartLoyaltyDiscount')), findsNothing);
    expect(find.byKey(const Key('cartCreditUsed')), findsNothing);
  });

  testWidgets('the warehouse loyalty discount and the pharmacy\'s credit show as their own lines', (tester) async {
    when(
      () => orderRepo.quoteCart(
        warehouseId: any(named: 'warehouseId'),
        items: any(named: 'items'),
        code: any(named: 'code'),
      ),
    ).thenAnswer(
      (_) async => const CartQuote(
        subtotalSyp: 20000,
        platformDiscountSyp: 0,
        loyaltyDiscountSyp: 2000,
        creditBalanceSyp: 500,
        creditUsedSyp: 500,
        preCodeSyp: 17500,
        finalSyp: 17500,
        usdToSyp: 1000,
      ),
    );
    await pumpCart(tester);
    expect(find.text('Warehouse loyalty discount'), findsOneWidget);
    expect(textOf(tester, 'cartLoyaltyDiscount'), '- 2,000 SYP');
    expect(find.text('From your credit with the warehouse'), findsOneWidget);
    expect(textOf(tester, 'cartCreditUsed'), '- 500 SYP');
    expect(textOf(tester, 'cartTotal'), '17,500 SYP');
    expect(find.byKey(const Key('cartPlatformDiscount')), findsNothing);
  });

  testWidgets('applying a code shows the server\'s breakdown: subtotal, discount, code, total', (tester) async {
    await pumpCart(tester);
    await applyCode(tester, 'abcd2345');

    expect(find.text('Code ABCD2345 applied'), findsOneWidget);
    expect(find.text('Discount code (ABCD2345)'), findsOneWidget);
    expect(textOf(tester, 'cartPlatformDiscount'), '- 800 SYP');
    expect(textOf(tester, 'discountCodeAmount'), '- 1,920 SYP');
    expect(textOf(tester, 'cartTotal'), '17,280 SYP');
    expect(find.byKey(const Key('discountCodeInput')), findsNothing, reason: 'one code per order');

    await tester.tap(find.byKey(const Key('discountCodeRemove')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('discountCodeInput')), findsOneWidget);
    expect(find.byKey(const Key('discountCodeAmount')), findsNothing);
    expect(textOf(tester, 'cartTotal'), '19,200 SYP', reason: 'quoted again without the code');
  });

  testWidgets('a refused code is explained under the field, in Arabic', (tester) async {
    previewAnswers.add(ServerFailure('expired', code: 'DISCOUNT_CODE_EXPIRED', statusCode: 400));
    await pumpCart(tester, locale: const Locale('ar'));
    await applyCode(tester, 'ABCD2345');

    expect(find.text('انتهت صلاحية كود الخصم.'), findsOneWidget);
    expect(cartCubit.state.discountCode, isNull);
  });

  testWidgets('each refusal reason has its own Arabic text', (tester) async {
    const reasons = {
      'DISCOUNT_CODE_INVALID': 'كود الخصم غير صحيح.',
      'DISCOUNT_CODE_NOT_STARTED': 'كود الخصم لم يبدأ بعد.',
      'DISCOUNT_CODE_LIMIT_REACHED': 'وصل كود الخصم إلى الحد الأقصى من الاستخدامات.',
      'DISCOUNT_CODE_PHARMACY_LIMIT_REACHED': 'استخدمت هذا الكود العدد الأقصى المسموح لصيدليتك.',
      'DISCOUNT_CODE_NOT_FOR_PHARMACY': 'هذا الكود غير مخصص لصيدليتك.',
      'DISCOUNT_CODE_NOT_FOR_WAREHOUSE': 'هذا الكود لا يعمل على طلبات هذا المستودع.',
      'DISCOUNT_CODE_PENDING_APPROVAL': 'كود الخصم بانتظار موافقة الإدارة.',
      'DISCOUNT_CODE_STOPPED': 'تم إيقاف كود الخصم.',
    };
    await pumpCart(tester, locale: const Locale('ar'));
    for (final entry in reasons.entries) {
      previewAnswers.add(ServerFailure('refused', code: entry.key, statusCode: 400));
      await applyCode(tester, 'ABCD2345');
      expect(find.text(entry.value), findsOneWidget, reason: entry.key);
    }
  });

  testWidgets('a code stopped after it was applied: the order is refused, the code comes off, the dialog says why',
      (tester) async {
    submitAnswers.add(ServerFailure(
      'changed',
      code: 'DISCOUNT_CODE_CHANGED',
      details: {'reason': 'DISCOUNT_CODE_STOPPED', 'code': 'ABCD2345'},
      statusCode: 409,
    ));
    await pumpCart(tester);
    await applyCode(tester, 'ABCD2345');
    await submitThroughConfirmation(tester);

    expect(find.text('Discount code changed'), findsOneWidget);
    expect(
      find.text(
        'This discount code has been stopped. The code was removed from your cart - check the total, then submit again.',
      ),
      findsOneWidget,
    );
    await tester.tap(inDialog('Close'));
    await tester.pumpAndSettle();
    expect(cartCubit.state.discountCode, isNull);
    expect(textOf(tester, 'cartTotal'), '19,200 SYP', reason: 'the total without the code');
    expect(find.text('This discount code has been stopped.'), findsOneWidget, reason: 'and the reason under the field');
  });

  testWidgets('a code whose amount changed: the dialog shows the new discount and total, and submits', (tester) async {
    submitAnswers.add(ServerFailure(
      'changed',
      code: 'DISCOUNT_CODE_CHANGED',
      details: {'reason': 'DISCOUNT_CODE_EDITED', 'code': 'ABCD2345', 'revision': 2},
      statusCode: 409,
    ));
    previewAnswers
      ..add(_quote)
      ..add(const CartQuote(
        code: 'ABCD2345',
        type: 'percentage',
        value: 5,
        revision: 2,
        subtotalSyp: 20000,
        platformDiscountSyp: 800,
        preCodeSyp: 19200,
        discountSyp: 960,
        finalSyp: 18240,
        usdToSyp: 1000,
      ));
    await pumpCart(tester);
    await applyCode(tester, 'ABCD2345');
    await submitThroughConfirmation(tester);

    expect(
      find.text('The discount code ABCD2345 changed. The discount is now 960 SYP and the total 18,240 SYP.'),
      findsOneWidget,
    );
    await tester.tap(inDialog('Submit order'));
    await tester.pumpAndSettle();

    expect(sentRevisions, [1, 2]);
    expect(find.text('tracking o1'), findsOneWidget);
  });
}
