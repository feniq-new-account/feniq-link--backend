// A pretend server that lives inside the app, for a build anyone can try with
// no backend at all: `--dart-define=DEMO_MODE=true` (see demo_mode.dart).
//
// It sits first on ApiClient's Dio and answers every request itself, in the
// same JSON shapes the real backend sends, so every screen runs unchanged.
// State (orders, complaints, reviews) lives in memory and is lost on restart.
// An order moves along on its own (pending -> ... -> delivered over about two
// and a half minutes) so the tracking screen can be watched working.
import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:feniq/demo/demo_catalog.dart';

class DemoBackendInterceptor extends Interceptor {
  DemoBackendInterceptor() : _db = _DemoDb();

  final _DemoDb _db;

  /// Long enough for loading states to show, short enough not to annoy.
  static const Duration _latency = Duration(milliseconds: 250);

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    await Future<void>.delayed(_latency);
    try {
      final body = _db.handle(options.method.toUpperCase(), _pathOf(options), options.queryParameters, options.data);
      // Round-trip through JSON so the screens get exactly the types a real
      // HTTP response would decode to.
      handler.resolve(Response<dynamic>(requestOptions: options, statusCode: 200, data: jsonDecode(jsonEncode(body))));
    } on _DemoError catch (e) {
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response<dynamic>(
            requestOptions: options,
            statusCode: e.status,
            data: {'message': e.message, if (e.code != null) 'code': e.code},
          ),
        ),
      );
    } catch (e) {
      // A bug in this pretend server should read as a server error, not hang a screen.
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response<dynamic>(
            requestOptions: options,
            statusCode: 500,
            data: {'message': 'خطأ في النسخة التجريبية: $e'},
          ),
        ),
      );
    }
  }

  // The path relative to the API root, query string dropped.
  static String _pathOf(RequestOptions options) {
    var path = options.path;
    final base = options.baseUrl;
    if (path.startsWith(base)) path = path.substring(base.length);
    final q = path.indexOf('?');
    if (q >= 0) path = path.substring(0, q);
    if (!path.startsWith('/')) path = '/$path';
    return path;
  }
}

class _DemoError implements Exception {
  _DemoError(this.status, this.message, {this.code});
  final int status;
  final String message;
  final String? code;
}

// --- data -------------------------------------------------------------------

const double _rate = 13000;
const String _myCity = 'اللاذقية';

class _Warehouse {
  const _Warehouse(
    this.id,
    this.nameAr,
    this.nameEn,
    this.city,
    this.address,
    this.phone, {
    this.minUsd = 0,
    this.from = '09:00',
    this.to = '17:00',
    this.priceFactor = 1.0,
    required this.keep,
  });
  final String id;
  final String nameAr;
  final String nameEn;
  final String city;
  final String address;
  final String phone;
  final num minUsd;
  final String from;
  final String to;
  final double priceFactor;
  // Which catalog rows this warehouse stocks (by row hash).
  final bool Function(int hash) keep;

  Map<String, dynamic> toJson() => {
    'id': id,
    'nameAr': nameAr,
    'nameEn': nameEn,
    'city': city,
    'phone': phone,
    'logo': null,
    'minOrderAmountUsd': minUsd,
    'maxOrderAmountUsd': null,
  };
}

final List<_Warehouse> _warehouses = [
  _Warehouse(
    'w1',
    'مستودع الشفاء',
    'Al-Shifa Warehouse',
    _myCity,
    'شارع بغداد، قرب دوار الزراعة',
    '0412345678',
    keep: (_) => true,
  ),
  _Warehouse(
    'w2',
    'مستودع الساحل الطبي',
    'Coast Medical',
    _myCity,
    'المشروع العاشر، جانب الصالة الرياضية',
    '0412223344',
    minUsd: 20,
    priceFactor: 0.97,
    from: '08:30',
    to: '16:00',
    keep: (h) => h % 3 != 0,
  ),
  _Warehouse(
    'w3',
    'مستودع النور',
    'Al-Nour Warehouse',
    _myCity,
    'جبلة، الشارع العام',
    '0418887766',
    priceFactor: 1.03,
    keep: (h) => h % 2 == 0,
  ),
  _Warehouse(
    'w4',
    'مستودع الفيحاء',
    'Al-Fayhaa Warehouse',
    'دمشق',
    'البرامكة، جانب كلية الصيدلة',
    '0112233445',
    minUsd: 50,
    priceFactor: 0.95,
    keep: (h) => h % 4 != 1,
  ),
];

const List<Map<String, Object>> _categories = [
  {'id': 'c1', 'nameAr': 'أقراص', 'nameEn': 'Tablets', 'sortOrder': 1},
  {'id': 'c2', 'nameAr': 'كبسولات', 'nameEn': 'Capsules', 'sortOrder': 2},
  {'id': 'c3', 'nameAr': 'شراب ومعلّقات', 'nameEn': 'Syrups & suspensions', 'sortOrder': 3},
  {'id': 'c4', 'nameAr': 'حقن', 'nameEn': 'Injections', 'sortOrder': 4},
  {'id': 'c5', 'nameAr': 'تحاميل', 'nameEn': 'Suppositories', 'sortOrder': 5},
  {'id': 'c6', 'nameAr': 'أخرى', 'nameEn': 'Other', 'sortOrder': 6},
];

String _categoryOf(String form) {
  if (form.contains('للحقن')) return 'c4';
  if (form.contains('أقراص')) return 'c1';
  if (form.contains('محافظ')) return 'c2';
  if (form.contains('شراب') || form.contains('معلق') || form.contains('نقط') || form.contains('غسول')) return 'c3';
  if (form.contains('تحاميل') || form.contains('بيوض')) return 'c5';
  return 'c6';
}

int _hash(String s) {
  var h = 0;
  for (final c in s.codeUnits) {
    h = (h * 31 + c) & 0x3fffffff;
  }
  return h;
}

class _Product {
  _Product({
    required this.id,
    required this.warehouse,
    required this.name,
    required this.manufacturer,
    required this.ingredient,
    required this.strength,
    required this.form,
    required this.priceUsd,
    required this.offerPct,
    required this.mfrPct,
    required this.available,
    required this.bonuses,
  });

  final String id;
  final _Warehouse warehouse;
  final String name;
  final String manufacturer;
  final String ingredient;
  final String strength;
  final String form;
  final double priceUsd;
  final int offerPct;
  final int mfrPct;
  final bool available;
  final List<Map<String, int>> bonuses;

  double get discountUsd {
    final d = priceUsd * (1 - offerPct / 100) * (1 - mfrPct / 100);
    return (d * 100).round() / 100;
  }

  int get unitSyp => (priceUsd * _rate).round();

  // Same rounding steps as the server (and core/utils/pricing.dart).
  int get finalSyp {
    var p = (priceUsd * _rate).round();
    if (offerPct != 0) p = (p * (1 - offerPct / 100)).round();
    if (mfrPct != 0) p = (p * (1 - mfrPct / 100)).round();
    return p;
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'categoryId': _categoryOf(form),
    'nameAr': name,
    'nameEn': name,
    'manufacturerAr': manufacturer,
    'manufacturerEn': null,
    'image': null,
    'activeIngredient': ingredient,
    'strength': strength,
    'unitAr': form,
    'unitEn': null,
    'priceUsd': priceUsd,
    'discountPriceUsd': discountUsd,
    'isAvailable': available,
    'offer': offerPct == 0
        ? null
        : {'id': 'of_$id', 'titleAr': 'عرض $offerPct%', 'discountPercentage': offerPct, 'isPermanent': true},
    'finalPriceSyp': finalSyp,
    'priceRate': _rate,
    'offerDiscountPercentage': offerPct,
    'manufacturerDiscountPercentage': mfrPct,
    'bonuses': bonuses,
  };
}

class _Order {
  _Order({
    required this.id,
    required this.number,
    required this.warehouse,
    required this.createdAt,
    required this.lines,
    this.notes,
    this.code,
  });

  final String id;
  final int number;
  final _Warehouse warehouse;
  final DateTime createdAt;
  final List<Map<String, dynamic>> lines;
  final String? notes;
  final Map<String, dynamic>? code;
  DateTime? cancelledAt;
  Map<String, dynamic>? review;

  int get subtotal => lines.fold(0, (sum, l) => sum + (l['lineTotal'] as int));
  int get codeDiscount => (code?['discountSyp'] as int?) ?? 0;
  int get finalPrice => subtotal - codeDiscount;

  // The order moves itself along so tracking can be watched live.
  static const List<int> _stepSeconds = [0, 25, 55, 90, 150];
  static const List<String> _steps = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

  List<Map<String, dynamic>> history(DateTime now) {
    final out = <Map<String, dynamic>>[];
    for (var i = 0; i < _steps.length; i++) {
      final at = createdAt.add(Duration(seconds: _stepSeconds[i]));
      if (at.isAfter(now)) break;
      if (cancelledAt != null && at.isAfter(cancelledAt!)) break;
      out.add({'status': _steps[i], 'changedAt': at.toUtc().toIso8601String()});
    }
    if (cancelledAt != null) {
      out.add({'status': 'cancelled', 'changedAt': cancelledAt!.toUtc().toIso8601String()});
    }
    return out;
  }

  String status(DateTime now) => history(now).last['status'] as String;

  DateTime? deliveredAt(DateTime now) {
    for (final h in history(now)) {
      if (h['status'] == 'delivered') return DateTime.parse(h['changedAt'] as String);
    }
    return null;
  }

  Map<String, dynamic> toJson(DateTime now) => {
    'id': id,
    'orderNumber': number,
    'status': status(now),
    'totalPrice': subtotal,
    'discountAmount': 0,
    'commissionAmount': 0,
    'advertisementDiscountAmount': 0,
    'discountCode': code,
    'finalPrice': finalPrice,
    'notes': notes,
    'cancelReason': cancelledAt != null ? 'ألغاها الصيدلاني' : null,
    'warehouseId': warehouse.id,
    'warehouseNameAr': warehouse.nameAr,
    'warehouseNameEn': warehouse.nameEn,
    'statusHistory': history(now),
    'createdAt': createdAt.toUtc().toIso8601String(),
    'items': lines,
    'linkedReturn': null,
    'myReview': review,
    'complaints': const <Object>[],
    'requiresDeliverySealPhoto': false,
  };
}

class _DemoDb {
  _DemoDb() {
    _loadCatalog();
    _seedOrders();
  }

  final Map<String, List<_Product>> _byWarehouse = {};
  final Map<String, _Product> _products = {};
  final List<_Order> _orders = [];
  final List<Map<String, dynamic>> _complaints = [];
  int _nextOrder = 1001;
  int _nextId = 1;

  String _id(String prefix) => '$prefix${_nextId++}';

  Map<String, dynamic> _user = {
    'id': 'u1',
    'name': 'د. صيدلاني تجريبي',
    'phone': '0933000000',
    'role': 'pharmacist',
    'status': 'active',
    'lang': 'ar',
  };

  Map<String, dynamic> get _pharmacy => {
    'id': 'ph1',
    'nameAr': 'صيدلية التجربة',
    'nameEn': 'Demo Pharmacy',
    'ownerName': _user['name'],
    'address': 'شارع 8 آذار',
    'city': _myCity,
    'phone': _user['phone'],
    'areaType': 'city',
  };

  void _loadCatalog() {
    final rows = (jsonDecode(kDemoCatalogJson) as List).cast<Map<String, dynamic>>();
    final discounted = <String, Set<String>>{};
    for (final w in _warehouses) {
      final list = <_Product>[];
      // Two companies per warehouse get a standing discount.
      final mfrs = rows.map((r) => r['m'] as String).toSet().toList()..sort();
      final picks = {mfrs[_hash(w.id) % mfrs.length], mfrs[(_hash(w.id) * 7 + 3) % mfrs.length]};
      discounted[w.id] = picks;
      for (var i = 0; i < rows.length; i++) {
        final r = rows[i];
        final name = r['n'] as String;
        final h = _hash('$name|${r['s']}');
        if (!w.keep(h)) continue;
        final hw = _hash('${w.id}$name');
        final base = 0.6 + (h % 900) / 100.0; // 0.60 .. 9.59 USD
        final price = ((base * w.priceFactor) * 100).round() / 100;
        final mfr = r['m'] as String;
        final p = _Product(
          id: '${w.id}_$i',
          warehouse: w,
          name: name,
          manufacturer: mfr,
          ingredient: r['c'] as String,
          strength: r['s'] as String,
          form: r['f'] as String,
          priceUsd: price,
          offerPct: hw % 13 == 0 ? const [10, 15, 20][(hw ~/ 13) % 3] : 0,
          mfrPct: picks.contains(mfr) ? 5 : 0,
          available: hw % 17 != 0,
          bonuses: hw % 7 == 0
              ? const [
                  {'buy': 10, 'free': 1},
                  {'buy': 20, 'free': 3},
                ]
              : const [],
        );
        list.add(p);
        _products[p.id] = p;
      }
      list.sort((a, b) => a.name.compareTo(b.name));
      _byWarehouse[w.id] = list;
    }
  }

  void _seedOrders() {
    final now = DateTime.now();
    List<(String, int)> pick(String warehouseId, List<int> at, List<int> qty) {
      final stock = _byWarehouse[warehouseId]!.where((p) => p.available).toList();
      return [for (var i = 0; i < at.length; i++) (stock[at[i]].id, qty[i])];
    }

    _placeOrder(
      _warehouses[0],
      pick('w1', [0, 7, 12], [5, 3, 10]),
      at: now.subtract(const Duration(days: 3, hours: 2)),
      notes: 'التوصيل قبل الظهر لو سمحتو',
    );
    final second = _placeOrder(_warehouses[1], pick('w2', [4, 9], [2, 6]), at: now.subtract(const Duration(days: 10)));
    second.review = {
      'id': _id('rv'),
      'rating': 5,
      'comment': 'سريعين ومرتبين',
      'createdAt': now.subtract(const Duration(days: 9)).toUtc().toIso8601String(),
    };
  }

  _Order _placeOrder(_Warehouse w, List<(String, int)> wanted, {DateTime? at, String? notes, String? code}) {
    final lines = <Map<String, dynamic>>[];
    for (final (productId, qty) in wanted) {
      final p = _products[productId];
      if (p == null || p.warehouse.id != w.id) {
        throw _DemoError(400, 'هذا الصنف غير موجود في هذا المستودع.');
      }
      if (!p.available) throw _DemoError(400, 'الصنف ${p.name} غير متوفر حالياً.', code: 'PRODUCT_UNAVAILABLE');
      if (qty < 1 || qty > 10000) throw _DemoError(400, 'الكمية غير صحيحة.');
      lines.add({
        'id': _id('oi'),
        'productId': p.id,
        'productNameAr': p.name,
        'productNameEn': p.name,
        'manufacturerAr': p.manufacturer,
        'manufacturerEn': null,
        'quantity': qty,
        'unitPrice': p.unitSyp,
        'discountPrice': p.finalSyp,
        'lineTotal': p.finalSyp * qty,
        'savingsUsd': ((p.priceUsd - p.discountUsd) * qty * 100).round() / 100,
        'freeQuantity': _freeQty(p.bonuses, qty),
      });
    }
    if (lines.isEmpty) throw _DemoError(400, 'السلة فارغة.');
    final subtotal = lines.fold<int>(0, (s, l) => s + (l['lineTotal'] as int));
    final codeTerms = code == null ? null : _codeTerms(code, subtotal);
    final order = _Order(
      id: _id('o'),
      number: _nextOrder++,
      warehouse: w,
      createdAt: at ?? DateTime.now(),
      lines: lines,
      notes: notes,
      code: codeTerms,
    );
    final total = order.finalPrice / _rate;
    if (total < w.minUsd) {
      _nextOrder--;
      throw _DemoError(400, 'الحد الأدنى للطلب من ${w.nameAr} هو ${w.minUsd} دولار.', code: 'ORDER_BELOW_MINIMUM');
    }
    _orders.insert(0, order);
    return order;
  }

  static int _freeQty(List<Map<String, int>> tiers, int qty) {
    Map<String, int>? best;
    for (final t in tiers) {
      if (t['buy']! <= qty && (best == null || t['buy']! > best['buy']!)) best = t;
    }
    return best == null ? 0 : (qty ~/ best['buy']!) * best['free']!;
  }

  // One demo discount code: FENIQ10 takes 10% off.
  Map<String, dynamic> _codeTerms(String code, int preCode) {
    if (code.trim().toUpperCase() != 'FENIQ10') {
      throw _DemoError(400, 'كود الخصم غير صالح. جرّب FENIQ10', code: 'DISCOUNT_CODE_NOT_FOUND');
    }
    return {
      'code': 'FENIQ10',
      'type': 'percentage',
      'value': 10,
      'revision': 1,
      'discountSyp': (preCode * 10 / 100).round(),
    };
  }

  _Warehouse _warehouse(String id) =>
      _warehouses.firstWhere((w) => w.id == id, orElse: () => throw _DemoError(404, 'المستودع غير موجود.'));

  _Order _order(String id) =>
      _orders.firstWhere((o) => o.id == id, orElse: () => throw _DemoError(404, 'الطلب غير موجود.'));

  Map<String, dynamic> _page(String key, List<Object?> all, Map<String, dynamic> q, {String cursorKey = 'after'}) {
    final limit = int.tryParse('${q['limit'] ?? ''}') ?? 20;
    final start = int.tryParse('${q[cursorKey] ?? ''}') ?? 0;
    final end = min(start + limit, all.length);
    final hasMore = end < all.length;
    return {
      key: all.sublist(min(start, all.length), end),
      'pagination': {'hasMore': hasMore, 'nextCursor': hasMore ? '$end' : null},
    };
  }

  Map<String, dynamic> _auth() => {
    'token': 'demo-token',
    'refreshToken': 'demo-refresh',
    'user': _user,
    'pharmacy': _pharmacy,
  };

  Map<String, dynamic> _asMap(Object? data) => data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};

  Object handle(String method, String path, Map<String, dynamic> q, Object? data) {
    final now = DateTime.now();
    final body = _asMap(data);
    final seg = path.split('/').where((s) => s.isNotEmpty).toList();
    final route = '$method /${seg.join('/')}';

    // --- auth
    if (route == 'POST /auth/otp/send') return {'message': 'رمز التحقق في النسخة التجريبية: 123456'};
    if (route == 'POST /auth/login-password' || route == 'POST /auth/login') {
      final phone = '${body['phone'] ?? ''}'.trim();
      if (phone.isNotEmpty) _user = {..._user, 'phone': phone};
      return _auth();
    }
    if (route == 'POST /auth/register') {
      _user = {
        ..._user,
        if (body['name'] != null) 'name': body['name'],
        if (body['phone'] != null) 'phone': body['phone'],
      };
      return _auth();
    }
    if (route == 'POST /auth/refresh') return _auth();
    if (route == 'GET /auth/me') return {'user': _user, 'pharmacy': _pharmacy};
    if (path == '/auth/device-token' || route == 'DELETE /auth/account') return {'ok': true};

    // --- warehouses & catalog
    if (route == 'GET /warehouses') {
      final mine = q['cityScope'] == 'mine';
      return {
        'warehouses': _warehouses.where((w) => !mine || w.city == _myCity).map((w) => w.toJson()).toList(),
        'cityFilterApplied': mine,
        'pharmacyCity': _myCity,
      };
    }
    if (route == 'GET /categories') return {'categories': _categories};
    if (seg.length >= 3 && seg[0] == 'warehouses' && method == 'GET') {
      final w = _warehouse(seg[1]);
      final products = _byWarehouse[w.id]!;
      if (seg[2] == 'profile') {
        final reviews = _orders.where((o) => o.warehouse.id == w.id && o.review != null).toList();
        final avg = reviews.isEmpty
            ? 4.6
            : reviews.fold<int>(0, (s, o) => s + (o.review!['rating'] as int)) / reviews.length;
        return {
          ...w.toJson(),
          'address': w.address,
          'deliveryStartTime': w.from,
          'deliveryEndTime': w.to,
          'deliveryType': 'self',
          'averageRating': avg,
          'reviewsCount': reviews.length,
          'recentReviews': [
            for (final o in reviews)
              {
                'rating': o.review!['rating'],
                'comment': o.review!['comment'],
                'createdAt': o.review!['createdAt'],
                'reviewerName': _user['name'],
              },
          ],
        };
      }
      if (seg[2] == 'manufacturers') {
        final seen = <String, int>{};
        for (final p in products) {
          seen.putIfAbsent(p.manufacturer, () => p.mfrPct);
        }
        final names = seen.keys.toList()..sort();
        return {
          'manufacturers': [
            for (final n in names)
              {'manufacturerAr': n, 'discountPercentage': seen[n], 'manufacturerId': 'm${_hash(n)}'},
          ],
        };
      }
      if (seg[2] == 'products' && seg.length == 3) {
        final search = '${q['search'] ?? ''}'.trim().toLowerCase();
        final category = q['categoryId'] as String?;
        final manufacturer = q['manufacturer'] as String?;
        final hits = products
            .where((p) {
              if (category != null && _categoryOf(p.form) != category) return false;
              if (manufacturer != null && p.manufacturer != manufacturer) return false;
              if (search.isEmpty) return true;
              return p.name.toLowerCase().contains(search) ||
                  p.ingredient.toLowerCase().contains(search) ||
                  p.manufacturer.contains(search);
            })
            .map((p) => p.toJson())
            .toList();
        return _page('products', hits, q);
      }
      if (seg[2] == 'products' && seg.length == 5 && seg[4] == 'alternatives') {
        final me = _products[seg[3]];
        if (me == null) throw _DemoError(404, 'الصنف غير موجود.');
        final alts = products
            .where((p) => p.id != me.id && p.ingredient.toLowerCase() == me.ingredient.toLowerCase())
            .map((p) => p.toJson())
            .toList();
        return {
          'products': alts,
          'pagination': {'hasMore': false, 'nextCursor': null},
        };
      }
    }
    if (route == 'GET /exchange-rate') return {'usdToSyp': _rate, 'updatedAt': now.toUtc().toIso8601String()};

    // --- cart & orders
    if (route == 'POST /discount-codes/preview' || route == 'POST /orders') {
      final w = _warehouse('${body['warehouseId']}');
      final wanted = [
        for (final raw in (body['items'] as List? ?? const []))
          ('${(raw as Map)['productId']}', (raw['quantity'] as num).toInt()),
      ];
      if ((body['packages'] as List?)?.isNotEmpty ?? false) {
        throw _DemoError(400, 'الباقات غير متاحة في النسخة التجريبية.');
      }
      final code = (route == 'POST /orders' ? body['discountCode'] : body['code']) as String?;
      if (route == 'POST /orders') {
        final order = _placeOrder(w, wanted, at: now, notes: body['notes'] as String?, code: code);
        return {'order': order.toJson(now)};
      }
      var subtotal = 0;
      for (final (id, qty) in wanted) {
        final p = _products[id];
        if (p != null) subtotal += p.finalSyp * qty;
      }
      final terms = code == null ? null : _codeTerms(code, subtotal);
      final discount = (terms?['discountSyp'] as int?) ?? 0;
      return {
        'discountCode': terms,
        'totals': {
          'subtotalSyp': subtotal,
          'platformDiscountSyp': 0,
          'preCodeSyp': subtotal,
          'discountSyp': discount,
          'finalSyp': subtotal - discount,
          'usdToSyp': _rate,
        },
      };
    }
    if (route == 'GET /orders') return _page('orders', _orders.map((o) => o.toJson(now)).toList(), q);
    if (route == 'GET /orders/savings-summary') {
      var offers = 0.0;
      var codes = 0;
      for (final o in _orders.where((o) => o.cancelledAt == null)) {
        for (final l in o.lines) {
          offers += (l['unitPrice'] as int) * (l['quantity'] as int) - (l['lineTotal'] as int);
        }
        codes += o.codeDiscount;
      }
      final total = offers.round() + codes;
      return {
        'savings': {
          'offerAndManufacturerSyp': offers.round(),
          'advertisementSyp': 0,
          'platformDiscountSyp': 0,
          'discountCodeSyp': codes,
          'totalSavingsSyp': total,
          'totalSavingsUsd': (total / _rate * 100).round() / 100,
        },
      };
    }
    if (route == 'GET /orders/returnable') return {'orders': const <Object>[]};
    if (seg.length >= 2 && seg[0] == 'orders') {
      final o = _order(seg[1]);
      if (seg.length == 2 && method == 'GET') return {'order': o.toJson(now)};
      if (seg.length == 3 && seg[2] == 'cancel') {
        if (!const ['pending', 'confirmed', 'preparing'].contains(o.status(now))) {
          throw _DemoError(400, 'لا يمكن إلغاء الطلب بعد خروجه للتوصيل.', code: 'ORDER_NOT_CANCELLABLE');
        }
        o.cancelledAt = now;
        return {'order': o.toJson(now)};
      }
      if (seg.length == 3 && seg[2] == 'reorder') {
        final items = <Map<String, dynamic>>[];
        final missing = <Map<String, dynamic>>[];
        for (final l in o.lines) {
          final p = _products[l['productId']];
          if (p != null && p.available) {
            items.add({...p.toJson(), 'quantity': l['quantity']});
          } else {
            missing.add({'productId': l['productId'], 'productNameAr': l['productNameAr'], 'quantity': l['quantity']});
          }
        }
        return {
          'reorder': {
            'warehouseId': o.warehouse.id,
            'warehouseNameAr': o.warehouse.nameAr,
            'warehouseNameEn': o.warehouse.nameEn,
            'items': items,
            'unavailableItems': missing,
          },
        };
      }
      if (seg.length == 3 && seg[2] == 'confirm-delivery') {
        return {'order': o.toJson(now)};
      }
    }

    // --- reviews
    if (route == 'GET /reviews') {
      final rated = _orders.where((o) => o.review != null).toList();
      return {
        'reviews': [
          for (final o in rated)
            {
              ...o.review!,
              'orderId': o.id,
              'orderNumber': o.number,
              'warehouseNameAr': o.warehouse.nameAr,
              'warehouseNameEn': o.warehouse.nameEn,
            },
        ],
        'averageRating': rated.isEmpty
            ? 0
            : rated.fold<int>(0, (s, o) => s + (o.review!['rating'] as int)) / rated.length,
      };
    }
    if (route == 'POST /reviews') {
      final o = _order('${body['orderId']}');
      o.review = {
        'id': _id('rv'),
        'rating': (body['rating'] as num).toInt(),
        'comment': body['comment'],
        'createdAt': now.toUtc().toIso8601String(),
      };
      return {'review': o.review};
    }

    // --- complaints
    if (route == 'GET /complaints') return _page('complaints', _complaints, q);
    if (route == 'POST /complaints') {
      final w = body['warehouseId'] != null ? _warehouse('${body['warehouseId']}') : null;
      final o = body['relatedOrderId'] != null ? _order('${body['relatedOrderId']}') : null;
      final c = {
        'id': _id('c'),
        'complaintNumber': 500 + _complaints.length + 1,
        'contextType': o != null ? 'order' : (w != null ? 'warehouse' : 'general'),
        'subject': body['subject'],
        'description': body['description'],
        'extraDetails': body['extraDetails'],
        'status': 'pending',
        'relatedOrderId': o?.id,
        'relatedOrderNumber': o?.number,
        'createdAt': now.toUtc().toIso8601String(),
        'updatedAt': now.toUtc().toIso8601String(),
        'warehouse': w == null
            ? null
            : {'id': w.id, 'nameAr': w.nameAr, 'nameEn': w.nameEn, 'phone': w.phone, 'city': w.city},
      };
      _complaints.insert(0, c);
      return {'complaint': c};
    }
    if (seg.length == 2 && seg[0] == 'complaints' && method == 'GET') {
      return {
        'complaint': _complaints.firstWhere(
          (c) => c['id'] == seg[1],
          orElse: () => throw _DemoError(404, 'الشكوى غير موجودة.'),
        ),
      };
    }

    // --- debts: what delivered orders add up to, per warehouse
    if (route == 'GET /pharmacy/debts') {
      final accounts = <Map<String, dynamic>>[];
      var total = 0;
      for (final w in _warehouses) {
        final delivered = _orders.where((o) => o.warehouse.id == w.id && o.deliveredAt(now) != null).toList();
        if (delivered.isEmpty) continue;
        final balance = delivered.fold<int>(0, (s, o) => s + o.finalPrice);
        total += balance;
        accounts.add({
          'warehouseId': w.id,
          'nameAr': w.nameAr,
          'nameEn': w.nameEn,
          'phone': w.phone,
          'balanceSyp': balance,
          'balanceUsd': (balance / _rate * 100).round() / 100,
          'lastActivityAt': delivered.first.deliveredAt(now)!.toUtc().toIso8601String(),
        });
      }
      return {'totalDebtSyp': total, 'totalCreditSyp': 0, 'netPositionSyp': total, 'accounts': accounts};
    }
    if (seg.length == 3 && seg[0] == 'pharmacy' && seg[1] == 'debts') {
      final w = _warehouse(seg[2]);
      final delivered = _orders.where((o) => o.warehouse.id == w.id && o.deliveredAt(now) != null).toList().reversed;
      var balance = 0;
      final rows = <Map<String, dynamic>>[];
      for (final o in delivered) {
        balance += o.finalPrice;
        rows.add({
          'id': 'le_${o.id}',
          'kind': 'charge',
          'effectiveAt': o.deliveredAt(now)!.toUtc().toIso8601String(),
          'debitSyp': o.finalPrice,
          'creditSyp': 0,
          'balanceSyp': balance,
          'reference': {'orderNumber': o.number, 'orderId': o.id},
        });
      }
      return {
        'statement': {
          'warehouse': {'nameAr': w.nameAr, 'nameEn': w.nameEn, 'phone': w.phone},
          'opening': {'syp': 0},
          'closing': {'syp': balance},
          'outstandingDebtSyp': balance,
          'creditBalanceSyp': 0,
          'summary': {'chargesSyp': balance, 'paymentsSyp': 0, 'returnCreditsSyp': 0, 'adjustmentsSyp': 0},
          'rows': rows,
        },
      };
    }

    // --- offers & ads
    if (route == 'GET /offers/active') {
      final offers = [
        for (final w in _warehouses)
          for (final p in _byWarehouse[w.id]!.where((p) => p.offerPct > 0))
            {
              'id': 'of_${p.id}',
              'titleAr': 'خصم ${p.offerPct}% على ${p.name}',
              'discountPercentage': p.offerPct,
              'endDate': null,
              'isPermanent': true,
              'warehouseId': w.id,
              'warehouseNameAr': w.nameAr,
              'warehouseNameEn': w.nameEn,
              'productId': p.id,
              'nameAr': p.name,
              'nameEn': p.name,
              'manufacturerAr': p.manufacturer,
              'unitAr': p.form,
              'priceUsd': p.priceUsd,
              'discountPriceUsd': p.discountUsd,
              'isAvailable': p.available,
            },
      ];
      return _page('offers', offers, q, cursorKey: 'cursor');
    }
    if (route == 'GET /advertisements/active') return _page('advertisements', const [], q, cursorKey: 'cursor');
    if (route == 'GET /banners/active') return {'banners': const <Object>[]};

    // --- returns: listing works, filing one does not
    if (route == 'GET /returns') return _page('returns', const [], q);

    throw _DemoError(404, 'هذه الميزة غير متاحة في النسخة التجريبية.');
  }
}
