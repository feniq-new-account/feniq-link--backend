import 'dart:convert';

import 'package:feniq/core/services/storage_service.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/cart/presentation/managers/cart_state.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';

/// Local drafts, separated by the authenticated account's JWT subject. No
/// credentials are stored here. Prices remain snapshots: restored carts must
/// be quoted again, and checkout still validates them on the server.
class CartDraftStore {
  CartDraftStore(this._storage);

  final StorageService _storage;

  // Reads the backend's `sub` claim only to select a local draft. This is
  // deliberately not authorization; the server still verifies every token.
  static String? accountIdFromToken(String? token) {
    try {
      final parts = token?.split('.');
      if (parts == null || parts.length != 3) return null;
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      final subject = (payload as Map<String, dynamic>)['sub'];
      return subject is String && subject.isNotEmpty ? subject : null;
    } catch (_) {
      return null;
    }
  }

  String _key(String accountId) => 'cart.draft.v1.$accountId';

  String encode(String accountId, CartState state) => jsonEncode({
    'version': 1,
    'accountId': accountId,
    'frontWarehouseId': state.warehouseId,
    'carts': [
      if (!state.isEmpty && state.warehouseId != null) _cartToJson(state),
      for (final cart in state.otherCarts.values)
        if (!cart.isEmpty && cart.warehouseId != null) _cartToJson(cart),
    ],
  });

  Future<void> saveEncoded(String accountId, String encoded) async {
    if (!await _storage.setString(_key(accountId), encoded)) {
      throw StateError('Could not save the cart draft');
    }
  }

  Future<void> clear(String accountId) async {
    if (!await _storage.remove(_key(accountId))) {
      throw StateError('Could not remove the cart draft');
    }
  }

  CartState restore(String accountId) {
    try {
      final raw = _storage.getString(_key(accountId));
      if (raw == null) return const CartState();
      final json = jsonDecode(raw) as Map<String, dynamic>;
      if (json['version'] != 1 || json['accountId'] != accountId) {
        return const CartState();
      }
      final carts = <String, CartState>{};
      for (final rawCart in json['carts'] as List) {
        final cart = _cartFromJson(rawCart as Map<String, dynamic>);
        if (!cart.isEmpty) carts[cart.warehouseId!] = cart;
      }
      if (carts.isEmpty) return const CartState();
      final front =
          carts.remove(json['frontWarehouseId']) ??
          carts.remove(carts.keys.first)!;
      return front.copyWith(otherCarts: Map.unmodifiable(carts));
    } catch (_) {
      // A truncated or older draft must never prevent sign-in or app startup.
      return const CartState();
    }
  }

  Map<String, dynamic> _cartToJson(CartState cart) => {
    'warehouseId': cart.warehouseId,
    'warehouseName': cart.warehouseName,
    'notes': cart.notes,
    'discountCode': cart.discountCode,
    'pendingIdempotencyKey': cart.pendingIdempotencyKey,
    'minOrderAmountUsd': cart.minOrderAmountUsd,
    'maxOrderAmountUsd': cart.maxOrderAmountUsd,
    'items': cart.items.map(_itemToJson).toList(),
  };

  CartState _cartFromJson(Map<String, dynamic> json) {
    final warehouseId = json['warehouseId'] as String;
    if (warehouseId.isEmpty) throw const FormatException('Missing warehouse');
    return CartState(
      warehouseId: warehouseId,
      warehouseName: json['warehouseName'] as String?,
      notes: json['notes'] as String? ?? '',
      discountCode: json['discountCode'] as String?,
      pendingIdempotencyKey: json['pendingIdempotencyKey'] as String?,
      minOrderAmountUsd: json['minOrderAmountUsd'] as num? ?? 0,
      maxOrderAmountUsd: json['maxOrderAmountUsd'] as num?,
      items: List.unmodifiable(
        (json['items'] as List).map(
          (item) => _itemFromJson(item as Map<String, dynamic>),
        ),
      ),
      // No spinner, stale quote, or in-flight flag survives process death.
      // Null limitsFetchedAt makes the first resume refresh limits as well.
      isQuoteStale: true,
    );
  }

  Map<String, dynamic> _itemToJson(CartItem item) => {
    'productId': item.productId,
    'nameAr': item.nameAr,
    'nameEn': item.nameEn,
    'manufacturerAr': item.manufacturerAr,
    'manufacturerEn': item.manufacturerEn,
    'image': item.image,
    'unitAr': item.unitAr,
    'unitEn': item.unitEn,
    'unitPriceUsd': item.unitPriceUsd,
    'discountPriceUsd': item.discountPriceUsd,
    'quantity': item.quantity,
    'packageId': item.packageId,
    'isAvailable': item.isAvailable,
    'previousPriceUsd': item.previousPriceUsd,
    'finalPriceSyp': item.finalPriceSyp,
    'priceRate': item.priceRate,
    'offerDiscountPercentage': item.offerDiscountPercentage,
    'manufacturerDiscountPercentage': item.manufacturerDiscountPercentage,
    'hasDiscountInputs': item.hasDiscountInputs,
    'bonuses': item.bonuses.map((bonus) => bonus.toJson()).toList(),
    'previousBonuses': item.previousBonuses
        ?.map((bonus) => bonus.toJson())
        .toList(),
    'packageContents': [
      for (final content in item.packageContents)
        {
          'productId': content.productId,
          'nameAr': content.nameAr,
          'nameEn': content.nameEn,
          'manufacturerAr': content.manufacturerAr,
          'manufacturerEn': content.manufacturerEn,
          'strength': content.strength,
          'dosageForm': content.dosageForm,
          'image': content.image,
          'quantityPerCopy': content.quantityPerCopy,
        },
    ],
  };

  CartItem _itemFromJson(Map<String, dynamic> json) {
    final productId = json['productId'] as String;
    final quantity = json['quantity'] as int;
    if (productId.isEmpty || quantity < 1) {
      throw const FormatException('Invalid cart line');
    }
    return CartItem(
      productId: productId,
      nameAr: json['nameAr'] as String,
      nameEn: json['nameEn'] as String?,
      manufacturerAr: json['manufacturerAr'] as String,
      manufacturerEn: json['manufacturerEn'] as String?,
      image: json['image'] as String?,
      unitAr: json['unitAr'] as String?,
      unitEn: json['unitEn'] as String?,
      unitPriceUsd: json['unitPriceUsd'] as num,
      discountPriceUsd: json['discountPriceUsd'] as num,
      quantity: quantity,
      packageId: json['packageId'] as String?,
      isAvailable: json['isAvailable'] as bool? ?? true,
      previousPriceUsd: json['previousPriceUsd'] as num?,
      finalPriceSyp: json['finalPriceSyp'] as num?,
      priceRate: json['priceRate'] as num?,
      offerDiscountPercentage: json['offerDiscountPercentage'] as num?,
      manufacturerDiscountPercentage:
          json['manufacturerDiscountPercentage'] as num?,
      hasDiscountInputs: json['hasDiscountInputs'] as bool? ?? false,
      bonuses: BonusTier.listFromJson(json['bonuses']),
      previousBonuses: json['previousBonuses'] == null
          ? null
          : BonusTier.listFromJson(json['previousBonuses']),
      packageContents: [
        for (final raw in json['packageContents'] as List? ?? const [])
          CartPackageContent(
            productId: raw['productId'] as String,
            nameAr: raw['nameAr'] as String,
            nameEn: raw['nameEn'] as String?,
            manufacturerAr: raw['manufacturerAr'] as String?,
            manufacturerEn: raw['manufacturerEn'] as String?,
            strength: raw['strength'] as String?,
            dosageForm: raw['dosageForm'] as String?,
            image: raw['image'] as String?,
            quantityPerCopy: raw['quantityPerCopy'] as int,
          ),
      ],
    );
  }
}
