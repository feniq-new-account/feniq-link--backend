import 'package:dio/dio.dart';
import 'package:feniq/demo/demo_backend.dart';
import 'package:feniq/features/auth/data/models/auth_response.dart';
import 'package:feniq/features/cart/data/models/cart_quote.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_list_result.dart';
import 'package:flutter_test/flutter_test.dart';

// The demo backend must answer in shapes the app's own models parse - these
// run its replies through those models.
void main() {
  late Dio dio;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'https://demo.invalid/api'))..interceptors.add(DemoBackendInterceptor());
  });

  Future<Map<String, dynamic>> get(String path, [Map<String, dynamic>? q]) async =>
      (await dio.get(path, queryParameters: q)).data as Map<String, dynamic>;
  Future<Map<String, dynamic>> post(String path, Object body) async =>
      (await dio.post(path, data: body)).data as Map<String, dynamic>;

  test('any phone and password signs in', () async {
    final auth = AuthResponse.fromJson(await post('/auth/login-password', {'phone': '0955123456', 'password': 'x'}));
    expect(auth.user.isActive, isTrue);
    expect(auth.pharmacy, isNotNull);
  });

  test('browse a warehouse, quote a cart with the demo code, place and cancel an order', () async {
    final list = WarehouseListResult.fromJson(await get('/warehouses', {'cityScope': 'mine'}));
    expect(list.cityFilterApplied, isTrue);
    expect(list.warehouses, isNotEmpty);
    final warehouseId = list.warehouses.first.id;

    final page = await get('/warehouses/$warehouseId/products', {'limit': 20});
    final products = (page['products'] as List).map((e) => ProductModel.fromJson(e as Map<String, dynamic>)).toList();
    expect(products, hasLength(20));
    expect((page['pagination'] as Map)['hasMore'], isTrue);
    final product = products.firstWhere((p) => p.isAvailable);

    final items = [
      {'productId': product.id, 'quantity': 3},
    ];
    final quote = CartQuote.fromJson(
      await post('/discount-codes/preview', {'warehouseId': warehouseId, 'code': 'feniq10', 'items': items}),
    );
    expect(quote.discountSyp, (quote.preCodeSyp * 0.1).round());
    expect(quote.finalSyp, quote.preCodeSyp - quote.discountSyp);

    final placed = await post('/orders', {'warehouseId': warehouseId, 'items': items, 'discountCode': 'FENIQ10'});
    final order = OrderModel.fromJson(placed['order'] as Map<String, dynamic>);
    expect(order.status, 'pending');
    expect(order.finalPrice, quote.finalSyp);

    final cancelled = OrderModel.fromJson(
      (await post('/orders/${order.id}/cancel', {}))['order'] as Map<String, dynamic>,
    );
    expect(cancelled.isCancelled, isTrue);
  });

  test('an unknown route is a clear error, not a crash', () async {
    await expectLater(
      dio.post('/returns', data: {}),
      throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', 404)),
    );
  });
}
