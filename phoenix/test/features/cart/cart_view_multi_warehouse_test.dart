import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/cart/presentation/views/cart_view.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
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

OrderModel _order(String id) => OrderModel(
  id: id,
  orderNumber: 1,
  status: 'pending',
  totalPrice: 0,
  discountAmount: 0,
  commissionAmount: 0,
  finalPrice: 0,
);

// Carts at several warehouses on the cart screen: a chip per warehouse to move
// between them, and one button that sends each as its own order.
void main() {
  setUpAll(() => registerFallbackValue(<CartItem>[]));

  late CartCubit cartCubit;
  late ExchangeRateCubit rateCubit;
  late _MockOrderRepository orderRepo;
  late List<String> sentFor;

  setUp(() {
    final warehouseRepo = _MockWarehouseRepository();
    when(() => warehouseRepo.getWarehouseProfile(any())).thenAnswer((_) async => throw Exception('not exercised'));
    orderRepo = _MockOrderRepository();
    stubCartQuote(orderRepo, usdToSyp: () => 1000);
    sentFor = [];
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
      final warehouseId = invocation.namedArguments[#warehouseId] as String;
      sentFor.add(warehouseId);
      return _order('o-$warehouseId');
    });
    cartCubit = CartCubit(orderRepository: orderRepo, warehouseRepository: warehouseRepo);
    rateCubit = ExchangeRateCubit(exchangeRateRepository: _MockExchangeRateRepository());
  });

  tearDown(() {
    cartCubit.close();
    rateCubit.close();
  });

  Future<void> pumpCart(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/cart',
      routes: [
        GoRoute(path: '/cart', name: RouteNames.cart, builder: (context, state) => const CartView()),
        GoRoute(
          path: '/my-orders',
          name: RouteNames.myOrders,
          builder: (context, state) => const Scaffold(body: Text('my-orders')),
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
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('one warehouse: the usual single submit, no warehouse chips', (tester) async {
    cartCubit.addProduct(_product('p1'), warehouseId: 'A', warehouseName: 'Warehouse A', quantity: 1);
    await pumpCart(tester);

    expect(find.byType(ChoiceChip), findsNothing);
    expect(find.text('Submit order'), findsOneWidget);
    expect(find.textContaining('Send all orders'), findsNothing);
  });

  testWidgets('a chip per warehouse moves between their carts', (tester) async {
    cartCubit.addProduct(_product('p1'), warehouseId: 'A', warehouseName: 'Warehouse A', quantity: 1);
    cartCubit.addProduct(_product('p2'), warehouseId: 'B', warehouseName: 'Warehouse B', quantity: 1);
    await pumpCart(tester);

    expect(find.byType(ChoiceChip), findsNWidgets(2));
    expect(find.textContaining('دواء p2'), findsOneWidget);
    expect(find.textContaining('دواء p1'), findsNothing);

    await tester.tap(find.text('Warehouse A · 1'));
    await tester.pumpAndSettle();

    expect(cartCubit.state.warehouseId, 'A');
    expect(find.textContaining('دواء p1'), findsOneWidget);
    expect(find.textContaining('دواء p2'), findsNothing);
  });

  testWidgets('"Send all orders" sends one order per warehouse, then opens the orders list', (tester) async {
    cartCubit.addProduct(_product('p1'), warehouseId: 'A', warehouseName: 'Warehouse A', quantity: 1);
    cartCubit.addProduct(_product('p2'), warehouseId: 'B', warehouseName: 'Warehouse B', quantity: 1);
    await pumpCart(tester);

    await tester.ensureVisible(find.text('Send all orders (2)'));
    await tester.tap(find.text('Send all orders (2)'));
    await tester.pumpAndSettle();
    // The confirmation names both warehouses.
    expect(find.textContaining('Warehouse A'), findsWidgets);
    expect(find.textContaining('Warehouse B'), findsWidgets);
    await tester.tap(find.widgetWithText(TextButton, 'Send all orders (2)').last);
    await tester.pumpAndSettle();

    expect(sentFor, ['B', 'A']);
    expect(cartCubit.state.isEmpty, isTrue);
    expect(find.text('my-orders'), findsOneWidget);
  });
}
