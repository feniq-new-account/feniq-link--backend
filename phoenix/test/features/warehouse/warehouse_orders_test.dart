import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_orders_repository.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_order_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_orders_cubit.dart';

class MockWarehouseOrdersRepository extends Mock implements WarehouseOrdersRepository {}

WarehouseOrderSummary _summary(String id, {int number = 1, String status = 'pending'}) =>
    WarehouseOrderSummary(id: id, orderNumber: number, status: status, finalPrice: 1000, itemCount: 2);

const _lineA = WarehouseOrderItem(id: 'i1', productNameAr: 'دواء', productNameEn: 'PANADOL', quantity: 10, discountPrice: 100);
const _lineB = WarehouseOrderItem(id: 'i2', productNameAr: 'دواء 2', quantity: 2, discountPrice: 50);
const _packageLine = WarehouseOrderItem(id: 'i3', productNameAr: 'عرض', quantity: 4, packageGroupId: 'g1');

WarehouseOrderDetail _detail({String status = 'pending', List<WarehouseOrderItem> items = const [_lineA, _lineB]}) =>
    WarehouseOrderDetail(id: 'o1', orderNumber: 7, status: status, items: items, finalPrice: 1100);

void main() {
  late MockWarehouseOrdersRepository repository;

  setUp(() => repository = MockWarehouseOrdersRepository());

  group('models', () {
    test('a detail reads the server shape, tolerating missing fields', () {
      final detail = WarehouseOrderDetail.fromJson({
        'success': true,
        'order': {
          'id': 'o1',
          'orderNumber': 12,
          'status': 'out_for_delivery',
          'finalPrice': 15000,
          'warehouseNetSyp': 14925,
          'commissionAmount': 75,
          'repCommission': {'rate': 2, 'repAmount': 150, 'feniqAmount': 75, 'savingAmount': 75},
          'requiresDeliverySealPhoto': true,
          'deliverySealPhoto': null,
          'pharmacy': {'id': 'p1', 'nameAr': 'صيدلية', 'nameEn': 'Pharmacy', 'phone': '0931000000'},
          'items': [
            {'id': 'i1', 'productNameAr': 'دواء', 'quantity': 3, 'discountPrice': 5000, 'freeQuantity': 1},
            {'id': 'i2', 'productNameAr': 'عرض', 'quantity': 1, 'discountPrice': 0, 'packageGroupId': 'g1'},
          ],
          'statusHistory': [
            {'status': 'pending', 'changedAt': '2026-10-07T10:00:00.000Z'},
          ],
        },
      });
      expect(detail.orderNumber, 12);
      expect(detail.repCommission?.feniqAmount, 75);
      expect(detail.items.first.freeQuantity, 1);
      expect(detail.items.last.isPackageLine, isTrue);
      expect(detail.isWaitingForSealPhoto, isTrue);
      expect(detail.isEditable, isFalse);
      expect(detail.nextStatus, 'delivered');
      expect(detail.statusHistory.single.changedAt, isNotNull);
    });

    test('a page reads its cursor, numeric or not', () {
      final page = WarehouseOrdersPage.fromJson({
        'orders': [
          {'id': 'o1', 'orderNumber': 5, 'status': 'pending', 'finalPrice': 10, 'items': [{}, {}]},
        ],
        'pagination': {'hasMore': true, 'nextCursor': 5},
      });
      expect(page.orders.single.itemCount, 2);
      expect(page.hasMore, isTrue);
      expect(page.nextCursor, '5');
    });

    test('the stages: an older waiting stage counts as awaiting approval', () {
      expect(nextWarehouseStatus('pending'), 'out_for_delivery');
      expect(nextWarehouseStatus('preparing'), 'out_for_delivery');
      expect(nextWarehouseStatus('out_for_delivery'), 'delivered');
      expect(nextWarehouseStatus('delivered'), isNull);
      expect(nextWarehouseStatus('cancelled'), isNull);
    });
  });

  group('WarehouseOrdersCubit', () {
    test('opens on the orders awaiting approval', () async {
      when(() => repository.getOrders(status: 'pending')).thenAnswer(
        (_) async => WarehouseOrdersPage(orders: [_summary('o1')], hasMore: true, nextCursor: '1'),
      );
      final cubit = WarehouseOrdersCubit(repository: repository);
      await cubit.load();
      expect(cubit.state.filter, 'pending');
      expect(cubit.state.status, RepLoadStatus.loaded);
      expect(cubit.state.orders.single.id, 'o1');
    });

    test('loads the next page without duplicating a row', () async {
      when(() => repository.getOrders(status: 'pending')).thenAnswer(
        (_) async => WarehouseOrdersPage(orders: [_summary('o1')], hasMore: true, nextCursor: '1'),
      );
      when(() => repository.getOrders(status: 'pending', after: '1')).thenAnswer(
        (_) async => WarehouseOrdersPage(orders: [_summary('o1'), _summary('o2', number: 2)]),
      );
      final cubit = WarehouseOrdersCubit(repository: repository);
      await cubit.load();
      await cubit.loadMore();
      expect(cubit.state.orders.map((o) => o.id), ['o1', 'o2']);
      expect(cubit.state.hasMore, isFalse);
    });

    test('changing the tab loads that status (null is all)', () async {
      when(() => repository.getOrders(status: any(named: 'status'))).thenAnswer(
        (_) async => const WarehouseOrdersPage(orders: []),
      );
      final cubit = WarehouseOrdersCubit(repository: repository);
      await cubit.setFilter(null);
      expect(cubit.state.filter, isNull);
      verify(() => repository.getOrders(status: null)).called(1);
    });

    test('an advanced order stays in place with its new status', () async {
      when(() => repository.getOrders(status: 'pending')).thenAnswer(
        (_) async => WarehouseOrdersPage(orders: [_summary('o1'), _summary('o2', number: 2)]),
      );
      when(() => repository.advance('o1')).thenAnswer((_) async => const AdvancedOrderStatus(status: 'out_for_delivery'));
      final cubit = WarehouseOrdersCubit(repository: repository);
      await cubit.load();
      final ok = await cubit.advance('o1');
      expect(ok, isTrue);
      expect(cubit.state.orders.map((o) => o.status), ['out_for_delivery', 'pending']);
      expect(cubit.state.advancingIds, isEmpty);
    });

    test('a refused advance leaves the order as it was and says why', () async {
      when(() => repository.getOrders(status: 'pending')).thenAnswer(
        (_) async => WarehouseOrdersPage(orders: [_summary('o1')]),
      );
      when(() => repository.advance('o1')).thenThrow(ServerFailure('no', code: 'ORDER_ALREADY_ADVANCED'));
      final cubit = WarehouseOrdersCubit(repository: repository);
      await cubit.load();
      final ok = await cubit.advance('o1');
      expect(ok, isFalse);
      expect(cubit.state.orders.single.status, 'pending');
      expect(cubit.state.actionErrorCode, 'ORDER_ALREADY_ADVANCED');
    });

    test('the detail screen\'s answer updates the row', () async {
      when(() => repository.getOrders(status: 'pending')).thenAnswer(
        (_) async => WarehouseOrdersPage(orders: [_summary('o1')]),
      );
      final cubit = WarehouseOrdersCubit(repository: repository);
      await cubit.load();
      cubit.applyDetail(_detail(status: 'out_for_delivery', items: const [_lineA]));
      expect(cubit.state.orders.single.status, 'out_for_delivery');
      expect(cubit.state.orders.single.finalPrice, 1100);
      expect(cubit.state.orders.single.itemCount, 1);
    });
  });

  group('WarehouseOrderDetailCubit', () {
    late WarehouseOrderDetailCubit cubit;

    setUp(() async {
      when(() => repository.getOrder('o1')).thenAnswer((_) async => _detail(items: const [_lineA, _lineB, _packageLine]));
      cubit = WarehouseOrderDetailCubit(repository: repository, orderId: 'o1');
      await cubit.load();
    });

    test('approve & send moves the order on', () async {
      when(() => repository.advance('o1')).thenAnswer((_) async => const AdvancedOrderStatus(status: 'out_for_delivery'));
      expect(await cubit.advance(), isTrue);
      expect(cubit.state.order?.status, 'out_for_delivery');
      expect(cubit.state.order?.isEditable, isFalse);
    });

    test('the draft sends only what changed, and never touches a package line', () async {
      cubit.startEditing();
      cubit.setQuantity(_lineA, 8);
      cubit.setQuantity(_lineA, 10); // back to what it was: no change
      cubit.setQuantity(_lineA, 8);
      cubit.toggleRemoved(_lineB);
      cubit.setQuantity(_packageLine, 1);
      cubit.toggleRemoved(_packageLine);
      expect(cubit.state.draftQuantities, {'i1': 8});
      expect(cubit.state.draftRemovals, {'i2'});

      when(
        () => repository.updateItems('o1', quantities: {'i1': 8}, removals: ['i2']),
      ).thenAnswer((_) async => _detail(items: const [_lineA, _packageLine]));
      expect(await cubit.saveEdits(), isTrue);
      expect(cubit.state.isEditing, isFalse);
      expect(cubit.state.order?.items.length, 2);
    });

    test('removing every line is refused before it reaches the server', () async {
      when(() => repository.getOrder('o1')).thenAnswer((_) async => _detail());
      await cubit.load();
      cubit.startEditing();
      cubit.toggleRemoved(_lineA);
      cubit.toggleRemoved(_lineB);
      expect(cubit.state.draftRemovesEverything, isTrue);
      expect(await cubit.saveEdits(), isFalse);
      verifyNever(() => repository.updateItems(any(), quantities: any(named: 'quantities'), removals: any(named: 'removals')));
    });

    test('a refused save keeps the draft so nothing typed is lost', () async {
      cubit.startEditing();
      cubit.setQuantity(_lineA, 3);
      when(
        () => repository.updateItems('o1', quantities: {'i1': 3}, removals: []),
      ).thenThrow(ServerFailure('no', code: 'ORDER_NOT_EDITABLE'));
      expect(await cubit.saveEdits(), isFalse);
      expect(cubit.state.isEditing, isTrue);
      expect(cubit.state.draftQuantities, {'i1': 3});
      expect(cubit.state.actionErrorCode, 'ORDER_NOT_EDITABLE');
    });

    test('an order on its way cannot be edited', () async {
      when(() => repository.getOrder('o1')).thenAnswer((_) async => _detail(status: 'out_for_delivery'));
      await cubit.load();
      cubit.startEditing();
      expect(cubit.state.isEditing, isFalse);
    });
  });
}
