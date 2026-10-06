import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/catalog/data/models/catalog_route_args.dart';
import 'package:feniq/features/catalog/data/models/elsewhere_alternative.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/catalog/presentation/widgets/alternatives_sheet.dart';
import 'package:feniq/features/exchange_rate/data/repositories/exchange_rate_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/generated/app_localizations.dart';
import 'package:feniq/routes/route_names.dart';

class _MockCatalogRepository extends Mock implements CatalogRepository {}

class _MockOrderRepository extends Mock implements OrderRepository {}

class _MockWarehouseRepository extends Mock implements WarehouseRepository {}

class _MockExchangeRateRepository extends Mock implements ExchangeRateRepository {}

ProductModel _product(String id, String nameEn, {String manufacturerAr = 'شركة', String? manufacturerEn}) => ProductModel(
  id: id,
  nameAr: 'دواء $id',
  nameEn: nameEn,
  manufacturerAr: manufacturerAr,
  manufacturerEn: manufacturerEn,
  activeIngredient: 'PARACETAMOL',
  strength: '500 MG',
  dosageForm: 'أقراص',
  priceUsd: 2,
  discountPriceUsd: 2,
  isAvailable: true,
  hasActiveOffer: false,
);

final _asked = _product('asked', 'Panadol 500');

ElsewhereAlternative _elsewhere(String warehouseId, String nameEn, ProductModel product, {bool same = false}) =>
    ElsewhereAlternative(
      warehouseId: warehouseId,
      warehouseNameAr: 'مستودع $nameEn',
      warehouseNameEn: nameEn,
      isSameMedicine: same,
      product: product,
    );

void main() {
  late _MockCatalogRepository repository;
  late CartCubit cartCubit;
  late ExchangeRateCubit rateCubit;
  CatalogRouteArgs? openedArgs;
  String? openedWarehouse;

  setUp(() {
    repository = _MockCatalogRepository();
    cartCubit = CartCubit(orderRepository: _MockOrderRepository(), warehouseRepository: _MockWarehouseRepository());
    rateCubit = ExchangeRateCubit(exchangeRateRepository: _MockExchangeRateRepository());
    openedArgs = null;
    openedWarehouse = null;
  });

  tearDown(() {
    cartCubit.close();
    rateCubit.close();
  });

  void stub({
    List<ProductModel> here = const [],
    Future<List<ElsewhereAlternative>> Function()? elsewhere,
  }) {
    when(() => repository.getAlternatives(warehouseId: 'home', productId: 'asked')).thenAnswer((_) async => here);
    when(() => repository.getAlternativesElsewhere(warehouseId: 'home', productId: 'asked'))
        .thenAnswer((_) => elsewhere?.call() ?? Future.value(const []));
  }

  Future<void> openSheet(WidgetTester tester) async {
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showAlternativesSheet(
                  context,
                  warehouseId: 'home',
                  product: _asked,
                  onAdd: (_, __) {},
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
        GoRoute(
          path: '/catalog/:warehouseId',
          name: RouteNames.catalog,
          builder: (context, state) {
            openedWarehouse = state.pathParameters['warehouseId'];
            openedArgs = state.extra as CatalogRouteArgs?;
            return const Scaffold(body: Text('other catalog'));
          },
        ),
      ],
    );
    await tester.pumpWidget(
      MultiRepositoryProvider(
        providers: [RepositoryProvider<CatalogRepository>.value(value: repository)],
        child: MultiBlocProvider(
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
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets("this warehouse's alternatives first, then the other warehouses'", (tester) async {
    stub(
      here: [_product('cheap', 'Cetamol 500')],
      elsewhere: () async => [
        _elsewhere('near', 'Near Pharma', _product('n1', 'Panadol 500'), same: true),
        _elsewhere('far', 'Far Pharma', _product('f1', 'Paramol 500')),
      ],
    );
    await openSheet(tester);

    expect(find.text('In this warehouse'), findsOneWidget);
    expect(find.text('Cetamol 500'), findsOneWidget);
    expect(find.text('At other warehouses'), findsOneWidget);
    expect(find.text('Near Pharma'), findsOneWidget);
    expect(find.text('Far Pharma'), findsOneWidget);
    expect(find.text('Same medicine'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Cetamol 500')).dy,
      lessThan(tester.getTopLeft(find.text('Near Pharma')).dy),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('tapping one goes to that warehouse, on the medicine', (tester) async {
    stub(
      elsewhere: () async => [
        _elsewhere(
          'near',
          'Near Pharma',
          _product('n1', 'Panadol 500', manufacturerAr: 'جي إس كيه', manufacturerEn: 'GSK'),
          same: true,
        ),
      ],
    );
    await openSheet(tester);

    await tester.tap(find.text('Go to warehouse'));
    await tester.pumpAndSettle();

    expect(find.text('other catalog'), findsOneWidget);
    expect(openedWarehouse, 'near');
    expect(openedArgs?.warehouseName, 'Near Pharma');
    expect(openedArgs?.manufacturer, 'جي إس كيه');
    expect(openedArgs?.manufacturerTitle, 'GSK');
    expect(openedArgs?.initialSearch, 'Panadol 500');
  });

  testWidgets('nothing here: says so, and still offers the other warehouses', (tester) async {
    stub(elsewhere: () async => [_elsewhere('near', 'Near Pharma', _product('n1', 'Panadol 500'), same: true)]);
    await openSheet(tester);

    expect(find.text('No alternatives in this warehouse.'), findsOneWidget);
    expect(find.text('Near Pharma'), findsOneWidget);
  });

  testWidgets('nothing anywhere: one empty message', (tester) async {
    stub();
    await openSheet(tester);

    expect(find.text('No alternatives here or at any other warehouse.'), findsOneWidget);
  });

  testWidgets("the other warehouses failing to load never hides this warehouse's list", (tester) async {
    stub(
      here: [_product('cheap', 'Cetamol 500')],
      elsewhere: () async => throw ServerFailure('offline'),
    );
    await openSheet(tester);

    expect(find.text('Cetamol 500'), findsOneWidget);
    expect(find.text('At other warehouses'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test('an entry parses from the server shape, and a malformed one is skipped', () {
    final entry = ElsewhereAlternative.tryFromJson({
      'warehouse': {'id': 'w9', 'nameAr': 'مستودع', 'nameEn': 'Store', 'city': 'Latakia', 'logo': null},
      'isSameMedicine': true,
      'product': {
        'id': 'p9',
        'nameAr': 'دواء',
        'manufacturerAr': 'شركة',
        'priceUsd': 2,
        'discountPriceUsd': 2,
        'isAvailable': true,
        'hasActiveOffer': false,
      },
    });
    expect(entry?.warehouseId, 'w9');
    expect(entry?.warehouseName, 'Store');
    expect(entry?.isSameMedicine, isTrue);
    expect(entry?.product.id, 'p9');
    expect(ElsewhereAlternative.tryFromJson({'warehouse': {'id': 'w9'}}), isNull);
    expect(ElsewhereAlternative.tryFromJson({'product': {}}), isNull);
  });
}
