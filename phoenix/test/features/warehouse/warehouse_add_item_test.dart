import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/network/api_client.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_orders_repository.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_orders_repository_impl.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_order_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/widgets/add_order_item_sheet.dart';
import 'package:feniq/generated/app_localizations.dart';

class _Repo extends Mock implements WarehouseOrdersRepository {}

class _Client extends Mock implements ApiClient {}

class _Dio extends Mock implements Dio {}

const _lineA = WarehouseOrderItem(id: 'i1', productId: 'pA', productNameAr: 'دواء', quantity: 10, discountPrice: 100);
const _lineB = WarehouseOrderItem(id: 'i2', productId: 'pB', productNameAr: 'دواء 2', quantity: 2, discountPrice: 50);
const _package = WarehouseOrderItem(id: 'i3', productId: 'pC', productNameAr: 'عرض', quantity: 4, packageGroupId: 'g1');

const _substitute = WarehouseProductHit(id: 'pX', nameAr: 'بديل', nameEn: 'SUBSTITUTE 500', priceUsd: 2);

WarehouseOrderDetail _detail({String status = 'pending', List<WarehouseOrderItem> items = const [_lineA, _lineB]}) =>
    WarehouseOrderDetail(id: 'o1', orderNumber: 7, status: status, items: items, finalPrice: 1100);

void main() {
  group('the draft of added products', () {
    late _Repo repository;
    late WarehouseOrderDetailCubit cubit;

    setUp(() async {
      repository = _Repo();
      when(() => repository.getOrder('o1')).thenAnswer((_) async => _detail(items: const [_lineA, _lineB, _package]));
      cubit = WarehouseOrderDetailCubit(repository: repository, orderId: 'o1');
      await cubit.load();
      cubit.startEditing();
    });

    test('a substitute for a line that ran out goes out with the removal, in one save', () async {
      cubit.toggleRemoved(_lineB);
      expect(cubit.addProduct(_substitute, 2), isTrue);
      expect(cubit.addProduct(_substitute, 1), isTrue); // picked again: quantities add up
      expect(cubit.state.draftAdditions['pX']?.quantity, 3);
      cubit.setAddedQuantity('pX', 5);

      when(
        () => repository.updateItems('o1', quantities: {}, removals: ['i2'], additions: {'pX': 5}),
      ).thenAnswer((_) async => _detail(items: const [_lineA, _package]));
      expect(await cubit.saveEdits(), isTrue);
      verify(() => repository.updateItems('o1', quantities: {}, removals: ['i2'], additions: {'pX': 5})).called(1);
      expect(cubit.state.isEditing, isFalse);
      expect(cubit.state.draftAdditions, isEmpty);
    });

    test('an addition alone is a change worth saving', () {
      expect(cubit.state.hasDraftChanges, isFalse);
      cubit.addProduct(_substitute, 1);
      expect(cubit.state.hasDraftChanges, isTrue);
      cubit.removeAdded('pX');
      expect(cubit.state.hasDraftChanges, isFalse);
    });

    test('a product already on the order is not added twice; a dropped one can come back as new', () {
      const sameAsA = WarehouseProductHit(id: 'pA', nameAr: 'دواء');
      const sameAsB = WarehouseProductHit(id: 'pB', nameAr: 'دواء 2');
      const sameAsPackage = WarehouseProductHit(id: 'pC', nameAr: 'عرض');
      expect(cubit.addProduct(sameAsA, 1), isFalse);
      expect(cubit.state.isOnOrder('pA'), isTrue);
      // A product inside a package is not a line of its own - adding it is fine.
      expect(cubit.state.isOnOrder('pC'), isFalse);
      expect(cubit.addProduct(sameAsPackage, 1), isTrue);
      cubit.toggleRemoved(_lineB);
      expect(cubit.state.isOnOrder('pB'), isFalse);
      expect(cubit.addProduct(sameAsB, 1), isTrue);
    });

    test('dropping every line is allowed when a product is being added in their place', () async {
      when(() => repository.getOrder('o1')).thenAnswer((_) async => _detail());
      await cubit.load();
      cubit.startEditing();
      cubit.toggleRemoved(_lineA);
      cubit.toggleRemoved(_lineB);
      expect(cubit.state.draftRemovesEverything, isTrue);
      cubit.addProduct(_substitute, 1);
      expect(cubit.state.draftRemovesEverything, isFalse);
    });

    test('nothing is added outside editing, or with a quantity under 1', () {
      expect(cubit.addProduct(_substitute, 0), isFalse);
      cubit.cancelEditing();
      expect(cubit.addProduct(_substitute, 1), isFalse);
      expect(cubit.state.draftAdditions, isEmpty);
    });

    test('a refused save keeps the added products so nothing is lost', () async {
      cubit.addProduct(_substitute, 2);
      when(
        () => repository.updateItems('o1', quantities: {}, removals: [], additions: {'pX': 2}),
      ).thenThrow(ServerFailure('gone', code: 'PRODUCT_UNAVAILABLE'));
      expect(await cubit.saveEdits(), isFalse);
      expect(cubit.state.isEditing, isTrue);
      expect(cubit.state.draftAdditions['pX']?.quantity, 2);
      expect(cubit.state.actionErrorCode, 'PRODUCT_UNAVAILABLE');
    });
  });

  group('the repository', () {
    late _Dio dio;
    late WarehouseOrdersRepositoryImpl repo;

    setUp(() {
      final client = _Client();
      dio = _Dio();
      when(() => client.dio).thenReturn(dio);
      repo = WarehouseOrdersRepositoryImpl(apiClient: client);
    });

    test('sends the added products as addItems, and leaves the key out when there are none', () async {
      final bodies = <Object?>[];
      when(() => dio.patch(any(), data: any(named: 'data'))).thenAnswer((call) async {
        bodies.add(call.namedArguments[#data]);
        return Response(
          data: {'order': {'id': 'o1', 'orderNumber': 7, 'status': 'pending'}},
          requestOptions: RequestOptions(path: '/warehouse/orders/o1/items'),
          statusCode: 200,
        );
      });
      await repo.updateItems('o1', removals: ['i2'], additions: {'pX': 3});
      await repo.updateItems('o1', quantities: {'i1': 4});
      expect(bodies.first, {
        'updateItems': <Object>[],
        'removeItems': ['i2'],
        'addItems': [
          {'productId': 'pX', 'quantity': 3},
        ],
      });
      expect((bodies.last as Map).containsKey('addItems'), isFalse);
    });

    test('searches only products a pharmacy could receive now', () async {
      when(() => dio.get(any(), queryParameters: any(named: 'queryParameters'))).thenAnswer(
        (_) async => Response(
          data: {
            'products': [
              {'id': 'p1', 'nameAr': 'أ', 'nameEn': 'A', 'priceUsd': 1.5, 'isAvailable': true},
              {'id': 'p2', 'nameAr': 'ب', 'isAvailable': false},
              {'nameAr': 'بلا رقم'},
            ],
          },
          requestOptions: RequestOptions(path: '/warehouse/products/search'),
          statusCode: 200,
        ),
      );
      final hits = await repo.searchProducts('  pan ');
      expect(hits.map((h) => h.id), ['p1']);
      expect(hits.single.priceUsd, 1.5);
      final query = verify(
        () => dio.get('/warehouse/products/search', queryParameters: captureAny(named: 'queryParameters')),
      ).captured.single as Map;
      expect(query['search'], 'pan');
      expect(query['available'], 'true');
    });
  });

  group('AddOrderItemSheet', () {
    Future<void> open(
      WidgetTester tester, {
      required Future<List<WarehouseProductHit>> Function(String) search,
      bool Function(String)? isOnOrder,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showAddOrderItemSheet(
                  context,
                  search: search,
                  isOnOrder: isOnOrder ?? (_) => false,
                  usdToSyp: 100,
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
    }

    testWidgets('search, pick, choose how many, add', (tester) async {
      final queries = <String>[];
      final result = Completer<DraftAddition?>();
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async => result.complete(
                  await showAddOrderItemSheet(
                    context,
                    search: (q) async {
                      queries.add(q);
                      return q.isEmpty ? const [] : const [_substitute];
                    },
                    isOnOrder: (_) => false,
                    usdToSyp: 100,
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('No available product matches.'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'sub');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(queries, ['', 'sub']);
      expect(find.textContaining('SUBSTITUTE 500'), findsOneWidget);

      await tester.tap(find.textContaining('SUBSTITUTE 500'));
      await tester.pumpAndSettle();
      expect(find.text('List price before offers. The final price is worked out when you save.'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.add).first);
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Add'));
      await tester.pumpAndSettle();
      final pick = await result.future;
      expect(pick?.product.id, 'pX');
      expect(pick?.quantity, 2);
    });

    testWidgets('a product already on the order cannot be picked', (tester) async {
      await open(
        tester,
        search: (_) async => const [_substitute],
        isOnOrder: (id) => id == 'pX',
      );
      expect(find.text('Already on the order - change its quantity in the list.'), findsOneWidget);
      await tester.tap(find.textContaining('SUBSTITUTE 500'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(FilledButton, 'Add'), findsNothing);
    });

    testWidgets('a failed search says so and can be retried', (tester) async {
      var calls = 0;
      await open(
        tester,
        search: (_) async {
          calls++;
          if (calls == 1) throw ServerFailure('down');
          return const [_substitute];
        },
      );
      expect(find.text('Retry'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.textContaining('SUBSTITUTE 500'), findsOneWidget);
    });
  });

  test('the detail state starts with no additions', () {
    const state = WarehouseOrderDetailState(status: RepLoadStatus.loaded);
    expect(state.draftAdditions, isEmpty);
  });
}
