import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/models/paginated_result.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/features/warehouse_selection/presentation/widgets/quick_search_sheet.dart';

class _Warehouses extends Mock implements WarehouseRepository {}
class _Catalog extends Mock implements CatalogRepository {}

void main() {
  late _Warehouses warehouses;
  late _Catalog catalog;

  const one = WarehouseModel(
    id: 'w1', nameAr: 'النجاح', nameEn: 'Success', city: 'Latakia', phone: '0912345678',
  );
  const two = WarehouseModel(
    id: 'w2', nameAr: 'الشفاء', nameEn: 'Healing', city: 'Latakia', phone: '0944444444',
  );
  const medicine = ProductModel(
    id: 'p1',
    nameAr: 'باراسيتامول',
    nameEn: 'Paracetamol',
    manufacturerAr: 'شركة فارما',
    manufacturerEn: 'Pharma',
    priceUsd: 5,
    discountPriceUsd: 5,
    isAvailable: true,
    hasActiveOffer: false,
  );

  setUp(() {
    warehouses = _Warehouses();
    catalog = _Catalog();
    when(() => warehouses.getWarehouses(onlyMyCity: false)).thenAnswer(
      (_) async => const WarehouseListResult(
        warehouses: [one, two], cityFilterApplied: false,
      ),
    );
    when(() => catalog.getProducts(
      warehouseId: any(named: 'warehouseId'),
      search: any(named: 'search'),
      limit: any(named: 'limit'),
    )).thenAnswer((invocation) async {
      final id = invocation.namedArguments[#warehouseId];
      return PaginatedResult<ProductModel>(
        items: id == 'w2' ? [medicine] : [],
        hasMore: false,
      );
    });
  });

  Future<void> showSearch(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        home: Scaffold(
          body: SizedBox(
            height: 700,
            child: QuickSearchSheet(
              warehouseRepository: warehouses,
              catalogRepository: catalog,
              visibleWarehouses: const [one],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('medicine search queries all pharmacy-visible warehouses, not just home city', (tester) async {
    await showSearch(tester);
    await tester.enterText(find.byKey(const ValueKey('quickSearch.input')), 'para');
    await tester.pump(const Duration(milliseconds: 360));
    await tester.pumpAndSettle();

    verify(() => warehouses.getWarehouses(onlyMyCity: false)).called(1);
    verify(() => catalog.getProducts(warehouseId: 'w1', search: 'para', limit: 6)).called(1);
    verify(() => catalog.getProducts(warehouseId: 'w2', search: 'para', limit: 6)).called(1);
    expect(find.text('Paracetamol'), findsOneWidget);
    expect(find.text('Pharma'), findsOneWidget);
    expect(find.text('Healing'), findsOneWidget);
  });

  testWidgets('warehouse name is searchable without a matching medicine', (tester) async {
    when(() => catalog.getProducts(
      warehouseId: any(named: 'warehouseId'),
      search: any(named: 'search'),
      limit: any(named: 'limit'),
    )).thenAnswer((_) async => const PaginatedResult<ProductModel>(
      items: [], hasMore: false,
    ));
    await showSearch(tester);
    await tester.enterText(find.byKey(const ValueKey('quickSearch.input')), 'Success');
    await tester.pump(const Duration(milliseconds: 360));
    await tester.pumpAndSettle();
    expect(find.text('Success'), findsOneWidget);
    expect(find.text('Healing'), findsNothing);
  });

  testWidgets('searching only one letter does not query the product catalog', (tester) async {
    await showSearch(tester);
    await tester.enterText(find.byKey(const ValueKey('quickSearch.input')), 'p');
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Enter at least two characters'), findsOneWidget);
    verifyNever(() => catalog.getProducts(
      warehouseId: any(named: 'warehouseId'),
      search: any(named: 'search'),
      limit: any(named: 'limit'),
    ));
  });
}
