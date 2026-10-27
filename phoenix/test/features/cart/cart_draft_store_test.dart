import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feniq/core/services/storage_service.dart';
import 'package:feniq/features/cart/data/repositories/cart_draft_store.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/cart/presentation/managers/cart_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  const line = CartItem(productId: 'p1', nameAr: 'دواء', manufacturerAr: 'شركة', quantity: 2, unitPriceUsd: 5, discountPriceUsd: 4);
  test('draft restores every warehouse and pending key without reviving in-flight flags', () async {
    final prefs = await SharedPreferences.getInstance(); final store = CartDraftStore(StorageService(prefs));
    const state = CartState(warehouseId: 'a', warehouseName: 'A', notes: 'note', pendingIdempotencyKey: 'pending-key', isSubmitting: true, items: [line], otherCarts: {
      'b': CartState(warehouseId: 'b', warehouseName: 'B', items: [line]),
    });
    await store.saveEncoded('owner', store.encode('owner', state));
    final restored = CartDraftStore(StorageService(prefs)).restore('owner');
    expect(restored.warehouseId, 'a'); expect(restored.otherCarts['b']?.items.single.quantity, 2);
    expect(restored.pendingIdempotencyKey, 'pending-key'); expect(restored.isSubmitting, false);
    expect(restored.isQuoteStale, true); expect(restored.notes, 'note');
    expect(store.restore('another-owner').isEmpty, true);
    await store.clear('owner'); expect(store.restore('owner').isEmpty, true);
  });
  test('corrupt and cross-account drafts cannot block sign-in or leak another account', () async {
    final prefs = await SharedPreferences.getInstance(); final store = CartDraftStore(StorageService(prefs));
    await prefs.setString('cart.draft.v1.owner', '{broken'); expect(store.restore('owner').isEmpty, true);
    await prefs.setString('cart.draft.v1.owner', store.encode('other', const CartState(warehouseId: 'a', items: [line])));
    expect(store.restore('owner').isEmpty, true);
    final token = 'x.${base64Url.encode(utf8.encode(jsonEncode({'sub': 'owner'})))}.x';
    expect(CartDraftStore.accountIdFromToken(token), 'owner');
    expect(CartDraftStore.accountIdFromToken('malformed'), null);
  });
}
