// Old-app compatibility (catalog overhaul, pre-merge): the pharmacy app
// already installed on phones parses the NEW backend's responses with its OLD
// models, and submits orders in its OLD request shape.
//
// - legacy/ holds the old model classes, copied unchanged from main (a0ff7cf);
//   only their package:feniq/ imports point at each other.
// - fixtures/ holds real responses from the new backend, recorded by
//   backend/test/compat.oldApp.test.js (COMPAT_RECORD=1), which also posts
//   fixtures/order_request_old.json to POST /orders and requires a 201. That
//   backend test re-checks, on every run, that every field in these fixtures
//   is still in the live responses.
// - This test parses every fixture with the old models, and builds the order
//   body the way the old OrderRepositoryImpl did - which must be exactly the
//   body the backend test posts.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'legacy/core/models/paginated_result.dart';
import 'legacy/features/advertisements/data/models/advertisement_cart_preparation.dart';
import 'legacy/features/advertisements/data/models/advertisement_model.dart';
import 'legacy/features/cart/data/models/cart_item.dart';
import 'legacy/features/cart/data/models/order_model.dart';
import 'legacy/features/cart/data/models/reorder_preparation.dart';
import 'legacy/features/catalog/data/models/category_model.dart';
import 'legacy/features/catalog/data/models/manufacturer_model.dart';
import 'legacy/features/catalog/data/models/product_model.dart';
import 'legacy/features/offers/data/models/offer_model.dart';

const _warehouseId = '6a0c00000000000000000004';
const _panadolId = '6a0c00000000000000000009';
const _amoxilId = '6a0c00000000000000000010';
const _legacyId = '6a0c00000000000000000011';
const _advertisementId = '6a0c00000000000000000013';

Map<String, dynamic> _fixture(String name) =>
    jsonDecode(File('test/compat/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

// The request body of the old OrderRepositoryImpl.submitOrder (main, a0ff7cf),
// the map literal copied as it was: product lines carry productId, quantity and
// the discountPriceUsd the cart showed; package lines their id and copy count.
// No bonus, no lira price.
Map<String, dynamic> _oldSubmitOrderBody({
  required String warehouseId,
  required List<CartItem> items,
  String? notes,
  String? idempotencyKey,
  double? rateUsed,
}) {
  final productLines = items.where((item) => !item.isPackage);
  final packageLines = items.where((item) => item.isPackage);
  return {
    'warehouseId': warehouseId,
    'items': productLines
        .map((item) => {
              'productId': item.productId,
              'quantity': item.quantity,
              'displayedUnitPriceUsd': item.discountPriceUsd,
            })
        .toList(),
    'packages': packageLines
        .map((item) => {
              'advertisementId': item.packageId,
              'copies': item.quantity,
            })
        .toList(),
    if (notes != null && notes.isNotEmpty) 'notes': notes,
    if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
    if (rateUsed != null) 'rateUsed': rateUsed,
  };
}

void main() {
  group('the old app parses the new catalog responses', () {
    test('categories', () {
      final categories = (_fixture('categories')['categories'] as List)
          .cast<Map<String, dynamic>>()
          .map(CategoryModel.fromJson)
          .toList();
      expect(categories.single.nameAr, 'مسكنات');
    });

    test('the warehouse manufacturers list', () {
      final manufacturers = (_fixture('manufacturers')['manufacturers'] as List).map(ManufacturerModel.fromJson).toList();
      expect(manufacturers.map((m) => m.name), containsAll(['جي إس كي', 'شركة قديمة']));
      expect(manufacturers.firstWhere((m) => m.name == 'جي إس كي').discountPercentage, 5);
    });

    test('the product page, including the offer, the legacy product and the effective image', () {
      final page = PaginatedResult.fromJson(_fixture('products'), 'products', ProductModel.fromJson);
      expect(page.items.map((p) => p.id), containsAll([_panadolId, _amoxilId, _legacyId]));

      final panadol = page.items.firstWhere((p) => p.id == _panadolId);
      expect(panadol.nameAr, 'بنادول أكسترا');
      expect(panadol.manufacturerAr, 'جي إس كي');
      expect(panadol.priceUsd, 1.37);
      // 7.5% offer then 5% manufacturer discount, in USD as the old app reads it.
      expect(panadol.discountPriceUsd, 1.2);
      expect(panadol.hasActiveOffer, isTrue);
      expect(panadol.isAvailable, isTrue);
      // The catalog's central image, in the field the old app already reads.
      expect(panadol.image, 'https://res.cloudinary.com/feniq/image/upload/v1/catalog/panadol.png');

      final legacy = page.items.firstWhere((p) => p.id == _legacyId);
      expect(legacy.nameAr, 'فيتامين سي قديم');
      expect(legacy.manufacturerAr, 'شركة قديمة');
      expect(legacy.hasActiveOffer, isFalse);
    });

    test('the company drill-down (manufacturer filter by name)', () {
      final page = PaginatedResult.fromJson(_fixture('products_by_manufacturer'), 'products', ProductModel.fromJson);
      expect(page.items.map((p) => p.id).toSet(), {_panadolId, _amoxilId});
    });
  });

  group('the old app parses the new offers and ads responses', () {
    test('active offers', () {
      final offers = (_fixture('offers_active')['offers'] as List)
          .map((e) => OfferModel.fromJson(e as Map<String, dynamic>))
          .toList();
      expect(offers.single.discountPriceUsd, 1.2);
    });

    test('active advertisements', () {
      final advertisements = (_fixture('advertisements_active')['advertisements'] as List)
          .map((e) => AdvertisementModel.fromJson(e as Map<String, dynamic>))
          .toList();
      expect(advertisements.single.id, _advertisementId);
      expect(advertisements.single.totalPriceUsd, 4.5);
    });

    test("a package's cart preparation", () {
      final cart = AdvertisementCartPreparation.fromJson(
        _fixture('advertisement_cart')['advertisementCart'] as Map<String, dynamic>,
      );
      expect(cart.advertisementId, _advertisementId);
      expect(cart.isComplete, isTrue);
      expect(cart.contents.single.productId, _amoxilId);
      expect(cart.contents.single.quantityPerCopy, 2);
    });
  });

  group('the old app submits an order the new backend accepts', () {
    test('its request body is exactly the one the backend test posts (201)', () {
      final products = PaginatedResult.fromJson(_fixture('products'), 'products', ProductModel.fromJson).items;
      ProductModel product(String id) => products.firstWhere((p) => p.id == id);
      final packageCart = AdvertisementCartPreparation.fromJson(
        _fixture('advertisement_cart')['advertisementCart'] as Map<String, dynamic>,
      );
      final cart = [
        CartItem.fromProduct(product(_panadolId), quantity: 25),
        CartItem.fromProduct(product(_legacyId), quantity: 3),
        packageCart.toCartLine(isArabic: true),
      ];

      final body = _oldSubmitOrderBody(
        warehouseId: _warehouseId,
        items: cart,
        notes: 'old app order',
        idempotencyKey: 'old-app-compat-0001',
        rateUsed: 13000,
      );

      expect(body, _fixture('order_request_old'));
      expect((body['items'] as List).every((line) => !(line as Map).containsKey('displayedBonuses')), isTrue);
    });

    test("the created order, its detail, the history list and a reorder parse", () {
      final created = OrderModel.fromJson(_fixture('order_created')['order'] as Map<String, dynamic>);
      expect(created.status, 'pending');
      expect(created.warehouseId, _warehouseId);
      expect(created.finalPrice, greaterThan(0));

      final detail = OrderModel.fromJson(_fixture('order_detail')['order'] as Map<String, dynamic>);
      expect(detail.id, created.id);
      final panadolLine = detail.items.firstWhere((line) => line.productId == _panadolId);
      // Charged for the 25 units ordered; the 2 bonus units are free.
      expect(panadolLine.quantity, 25);
      expect(panadolLine.lineTotal, panadolLine.discountPrice * 25);

      final history = PaginatedResult.fromJson(_fixture('orders_list'), 'orders', OrderModel.fromJson);
      expect(history.items.single.id, created.id);

      final reorder = ReorderPreparation.fromJson(_fixture('reorder')['reorder'] as Map<String, dynamic>);
      expect(reorder.items.map((line) => line.productId), containsAll([_panadolId, _legacyId]));
    });
  });
}
