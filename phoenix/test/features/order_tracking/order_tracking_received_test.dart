import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';
import 'package:feniq/features/order_tracking/presentation/managers/order_tracking_cubit.dart';
import 'package:feniq/features/reviews/data/repositories/review_repository.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';

// The pharmacist's "I received the order" tap: one call, the order comes back
// delivered; a refusal (delivered meanwhile) reloads so the button goes away.
class MockOrderRepository extends Mock implements OrderRepository {}

class MockReviewRepository extends Mock implements ReviewRepository {}

class MockWarehouseRepository extends Mock implements WarehouseRepository {}

OrderModel _order(String status) => OrderModel(
  id: 'o1',
  orderNumber: 1,
  status: status,
  totalPrice: 1000,
  discountAmount: 0,
  commissionAmount: 0,
  finalPrice: 1000,
);

void main() {
  late MockOrderRepository orderRepo;
  late MockWarehouseRepository warehouseRepo;

  setUp(() {
    orderRepo = MockOrderRepository();
    warehouseRepo = MockWarehouseRepository();
    when(
      () => warehouseRepo.getWarehouses(onlyMyCity: any(named: 'onlyMyCity')),
    ).thenAnswer((_) async => const WarehouseListResult(warehouses: [], cityFilterApplied: false));
  });

  OrderTrackingCubit build() => OrderTrackingCubit(
    orderRepository: orderRepo,
    reviewRepository: MockReviewRepository(),
    warehouseRepository: warehouseRepo,
    orderId: 'o1',
  );

  test('received: the order comes back delivered', () async {
    when(() => orderRepo.confirmReceived('o1')).thenAnswer((_) async => _order('delivered'));
    final cubit = build();
    expect(await cubit.confirmReceived(), isTrue);
    expect(cubit.state.order?.status, 'delivered');
    expect(cubit.state.isConfirmingReceipt, isFalse);
    expect(cubit.state.order?.canConfirmReceived, isFalse);
  });

  test('received: a refusal shows the error and reloads the order', () async {
    when(
      () => orderRepo.confirmReceived('o1'),
    ).thenThrow(ServerFailure('not on the way', code: 'ORDER_NOT_ON_THE_WAY'));
    when(() => orderRepo.getOrder('o1')).thenAnswer((_) async => _order('delivered'));
    final cubit = build();
    expect(await cubit.confirmReceived(), isFalse);
    expect(cubit.state.isConfirmingReceipt, isFalse);
    expect(cubit.state.order?.status, 'delivered');
    verify(() => orderRepo.getOrder('o1')).called(1);
  });
}
