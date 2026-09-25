import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';
import 'package:uuid/uuid.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/session/session_scope.dart';
import 'package:feniq/features/cart/data/models/cart_item.dart';
import 'package:feniq/features/cart/data/models/cart_quote.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/cart/data/repositories/order_repository.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';

import 'cart_state.dart';

/// How long the warehouse's own order-size limits (CartState.minOrderAmountUsd
/// / maxOrderAmountUsd) are treated as current before an app-resume is worth
/// spending a request on.
///
/// Shorter than ExchangeRateCubit's 10 minutes on purpose: a warehouse
/// changes its own limits by hand, at any moment, and the effect is immediate
/// and binary on this one screen - the submit button is either wrongly
/// enabled (the server then refuses the order) or wrongly disabled (blocked
/// for no reason) - rather than a figure elsewhere in the app being a little
/// off. The cart screen opening still re-reads unconditionally
/// (refreshWarehouseLimits); this only bounds how wrong a cart left open
/// through a background/resume can get.
const Duration kCartLimitsTtl = Duration(minutes: 5);

/// How long after the last cart edit the cart is re-quoted. Long enough that
/// tapping a stepper five times costs one request, short enough that the total
/// the pharmacist is about to confirm is current.
const Duration kCartQuoteDelay = Duration(milliseconds: 400);

/// Whether a refusal is about the discount code itself (it stopped working),
/// as opposed to the network or anything else.
bool isDiscountCodeRefusal(String? code) =>
    code != null && code.startsWith('DISCOUNT_CODE_') && code != 'DISCOUNT_CODE_CHANGED';

// Section 6.6: every order belongs to exactly one warehouse, so the cart as a
// whole is scoped to one warehouseId at a time. Registered globally (like
// AuthCubit) since it must survive navigation between the catalog and cart
// screens, and even a trip back to warehouse selection.
//
// It does NOT survive the account: the cart (its lines, its warehouse, its
// pending idempotency key) belongs to whoever built it, so a sign-out resets
// it through SessionScope - otherwise the next pharmacist on the same phone
// would find it, and could submit it as their own order.
class CartCubit extends Cubit<CartState> implements SessionScoped {
  CartCubit({
    required OrderRepository orderRepository,
    required WarehouseRepository warehouseRepository,
    SessionScope? sessionScope,
    // Test seam for the TTL clock; production uses the wall clock.
    DateTime Function()? now,
  })  : _orderRepository = orderRepository,
        _warehouseRepository = warehouseRepository,
        _sessionScope = sessionScope,
        _now = now ?? DateTime.now,
        super(const CartState()) {
    _sessionScope?.register(this);
  }

  final OrderRepository _orderRepository;
  final WarehouseRepository _warehouseRepository;
  final SessionScope? _sessionScope;
  final DateTime Function() _now;
  final Uuid _uuid = const Uuid();

  // The cart quote in the air. Every quote, edit, apply, removal and reset
  // bumps [_quoteRequest], and an answer to an older request is dropped - so a
  // slow quote for last second's cart never overwrites the current one.
  Timer? _requoteTimer;
  int _quoteRequest = 0;

  // How many cart screens are showing the summary (CartView attaches in
  // initState and detaches in dispose). Edits re-quote only while one is: a
  // pharmacist adding thirty products from the catalog costs no quotes, and
  // the cart screen quotes as it opens.
  int _quoteViewers = 0;

  // Bumped by every sign-out. A submit that was in flight when the account
  // changed must not write its outcome into the next account's cart - see
  // submitOrder.
  int _session = 0;

  // Back to a pristine CartState: lines, warehouse, notes, limits, errors and
  // the pending idempotency key all go. The key named a request of the account
  // that just left; nothing the next one sends may carry it.
  @override
  void resetForSignOut() {
    _session++;
    _cancelQuote();
    if (isClosed) return;
    emit(const CartState());
  }

  @override
  Future<void> close() {
    _cancelQuote();
    _sessionScope?.unregister(this);
    return super.close();
  }

  void _cancelQuote() {
    _requoteTimer?.cancel();
    _requoteTimer = null;
    _quoteRequest++;
  }

  // ---------------------------------------------------------------------------
  // The cart quote - what the server says this cart costs (subtotal, platform
  // discount, the discount code's amount, total). The cart screen shows these
  // figures, never a local sum, so the pharmacist always sees what the order
  // will actually cost.

  /// A cart screen is showing the summary: quote the cart now unless the
  /// figures on hand are the server's for this exact cart, and keep
  /// re-quoting after edits while it shows.
  void attachQuoteView() {
    _quoteViewers++;
    if (!state.isEmpty && !state.hasCurrentQuote) refreshQuote();
  }

  void detachQuoteView() {
    if (_quoteViewers > 0) _quoteViewers--;
  }

  /// Quotes the cart now - the screen opening, and the retry after a quote
  /// that failed.
  Future<void> refreshQuote() async {
    if (state.warehouseId == null || state.isEmpty) return;
    _requoteTimer?.cancel();
    final request = ++_quoteRequest;
    emit(state.copyWith(isQuoting: true, clearQuoteError: true));
    await _requote(request);
  }

  bool _isStaleQuote(int request, int session, String warehouseId) =>
      isClosed || request != _quoteRequest || session != _session || state.warehouseId != warehouseId;

  // The state an edit that changes what the cart costs lands in - in the SAME
  // emit as the edit: the quote on hand no longer describes the cart. With the
  // cart screen showing, a new one is on its way (_scheduleRequote); without
  // it, the screen asks when it opens.
  CartState _costChanged(CartState next) => next.isEmpty
      ? next
      : next.copyWith(isQuoteStale: true, isQuoting: _quoteViewers > 0, clearQuoteError: true);

  // Right after emitting a _costChanged state. Debounced: the old figures stay
  // on screen (with the submit button held) until the edits settle.
  void _scheduleRequote() {
    _requoteTimer?.cancel();
    final request = ++_quoteRequest;
    if (_quoteViewers == 0 || state.isEmpty) return;
    _requoteTimer = Timer(kCartQuoteDelay, () => _requote(request));
  }

  // A brand-new cart (another warehouse, a reorder, a package that replaced
  // the cart) has no quote yet; a cart screen already showing asks for one.
  void _quoteNewCart() {
    if (_quoteViewers > 0 && !state.isEmpty) refreshQuote();
  }

  Future<void> _requote(int request) async {
    final warehouseId = state.warehouseId;
    if (warehouseId == null || state.isEmpty || request != _quoteRequest) return;
    final code = state.discountCode;
    final session = _session;
    try {
      final quote = await _orderRepository.quoteCart(warehouseId: warehouseId, items: state.items, code: code);
      if (_isStaleQuote(request, session, warehouseId)) return;
      emit(state.copyWith(quote: quote, isQuoting: false, isQuoteStale: false, clearQuoteError: true));
    } on Failure catch (f) {
      if (_isStaleQuote(request, session, warehouseId)) return;
      if (code != null && isDiscountCodeRefusal(f.code)) {
        // The applied code stopped working while the cart was being edited
        // (expired, stopped, used up...): it comes off, with the reason under
        // the field, and the cart is quoted again without it.
        emit(state.copyWith(
          clearDiscountCode: true,
          discountCodeErrorCode: f.code,
          clearPendingIdempotencyKey: true,
        ));
        await _requote(++_quoteRequest);
        return;
      }
      // The network, most likely: no figures to show - the summary offers a
      // retry, and the submit button waits for it.
      emit(state.copyWith(isQuoting: false, isQuoteStale: true, quoteErrorCode: f.code ?? 'UNEXPECTED_ERROR'));
    } catch (_) {
      if (_isStaleQuote(request, session, warehouseId)) return;
      emit(state.copyWith(isQuoting: false, isQuoteStale: true, quoteErrorCode: 'UNEXPECTED_ERROR'));
    }
  }

  // ---------------------------------------------------------------------------
  // Discount code (one per order)

  /// Checks [rawCode] against this cart on the server and, if it works, applies
  /// it: the summary then shows the quote with the code's discount. A code
  /// that cannot be used leaves the cart as it was, with the reason in
  /// [CartState.discountCodeErrorCode].
  Future<void> applyDiscountCode(String rawCode) async {
    final code = rawCode.trim().toUpperCase();
    final warehouseId = state.warehouseId;
    if (code.isEmpty || warehouseId == null || state.isEmpty) return;

    _requoteTimer?.cancel();
    final request = ++_quoteRequest;
    final session = _session;
    emit(state.copyWith(isQuoting: true, clearDiscountCodeError: true));
    try {
      final quote = await _orderRepository.quoteCart(warehouseId: warehouseId, items: state.items, code: code);
      if (_isStaleQuote(request, session, warehouseId)) return;
      final applied = quote.code ?? code;
      emit(state.copyWith(
        discountCode: applied,
        quote: quote,
        isQuoting: false,
        isQuoteStale: false,
        clearQuoteError: true,
        // The code goes to the server with the order - a different request.
        clearPendingIdempotencyKey: state.discountCode != applied,
      ));
    } on Failure catch (f) {
      if (_isStaleQuote(request, session, warehouseId)) return;
      _applyRefused(f.code ?? 'UNEXPECTED_ERROR');
    } catch (_) {
      if (_isStaleQuote(request, session, warehouseId)) return;
      _applyRefused('UNEXPECTED_ERROR');
    }
  }

  // The cart itself did not change, so the quote it had still stands - unless
  // it had gone stale meanwhile (the apply superseded its re-quote), in which
  // case it is asked for again.
  void _applyRefused(String reason) {
    emit(state.copyWith(isQuoting: false, discountCodeErrorCode: reason));
    if (state.isQuoteStale && _quoteViewers > 0) refreshQuote();
  }

  /// Takes the code off the cart; the cart is quoted again without it.
  void removeDiscountCode() {
    if (state.discountCode == null) {
      if (state.discountCodeErrorCode != null) emit(state.copyWith(clearDiscountCodeError: true));
      return;
    }
    _cancelQuote();
    emit(state.copyWith(
      clearDiscountCode: true,
      clearDiscountCodeError: true,
      isQuoting: false,
      isQuoteStale: true,
      clearPendingIdempotencyKey: true,
    ));
    if (_quoteViewers > 0) refreshQuote();
  }

  // The limits read currently in the air, so the cart screen opening while
  // the warehouse's own fetch is still running makes one request, not two.
  Future<void>? _limitsInFlight;

  /// Re-reads this warehouse's order-size limits.
  ///
  /// Called when the cart screen opens (CartView), on top of the read that
  /// happens when the cart first points at a warehouse. The limits gate the
  /// submit button, and a warehouse can change them while a cart sits open:
  /// with only the original read, a cart that no longer clears a raised
  /// minimum still offered a submit the server would refuse, and one that a
  /// lowered minimum had made valid stayed blocked for no reason.
  ///
  /// A no-op when the cart is not bound to a warehouse yet.
  ///
  /// This is also the only path that raises [CartState.isRefreshingLimits]:
  /// the indicator belongs to the open cart screen asking, not to the silent
  /// read the cart kicks off when it first points at a warehouse - nothing is
  /// on screen to show it then, and every mutation would emit two extra
  /// states for nobody.
  Future<void> refreshWarehouseLimits() async {
    final warehouseId = state.warehouseId;
    if (warehouseId == null) return;
    if (!isClosed) emit(state.copyWith(isRefreshingLimits: true));
    final session = _session;
    try {
      await _loadWarehouseLimits(warehouseId);
    } finally {
      // Down on every path, including a failed read and a cart that moved on.
      if (!isClosed && session == _session && state.isRefreshingLimits) {
        emit(state.copyWith(isRefreshingLimits: false));
      }
    }
  }

  /// Whether the limits on hand are old enough to be worth re-reading.
  ///
  /// No warehouse bound yet, or no successful read yet ([CartState.
  /// limitsFetchedAt] null), counts as stale - there is nothing current to
  /// protect by waiting. So does a timestamp in the future (the device clock
  /// moved).
  bool get limitsAreStale {
    if (state.warehouseId == null) return false;
    final fetchedAt = state.limitsFetchedAt;
    if (fetchedAt == null) return true;
    final age = _now().difference(fetchedAt);
    return age.isNegative || age >= kCartLimitsTtl;
  }

  /// The app-resume path: re-reads the limits only if they have gone stale
  /// (see [limitsAreStale] / [kCartLimitsTtl]) while the cart sat open with
  /// the app in the background. Called from main.dart's single app-resume
  /// observer, alongside ExchangeRateCubit.refreshIfStale - not a listener of
  /// its own, for the same reason.
  ///
  /// Deliberately does NOT raise [CartState.isRefreshingLimits]: unlike
  /// [refreshWarehouseLimits], this can fire with no cart screen anywhere in
  /// view, and raising a flag nothing is showing would be pointless - if the
  /// cart screen does happen to be the one in front, the limits simply
  /// update once the read lands, same as any other background refresh.
  Future<void> refreshLimitsIfStale() {
    if (!limitsAreStale) return Future<void>.value();
    return _loadWarehouseLimits(state.warehouseId!);
  }

  // The warehouse's own order-size limits (backend: warehouse.model.js), so
  // the cart can show the limit and gate the submit button locally instead of
  // only finding out on a rejected submit.
  //
  // Deliberately silent on failure: leaving the limits as they were means a
  // lookup problem can never block an otherwise valid order - order.service.js
  // enforces the real rule either way.
  //
  // Nothing but the limits (and the indicator flag) is touched: the lines, the
  // subtotal, the notes and the pending idempotency key all stay exactly as
  // they are, so a re-read can never disturb a cart being worked on.
  Future<void> _loadWarehouseLimits(String warehouseId) {
    final inFlight = _limitsInFlight;
    if (inFlight != null) return inFlight;
    final request = _readWarehouseLimits(warehouseId).whenComplete(() {
      _limitsInFlight = null;
    });
    _limitsInFlight = request;
    return request;
  }

  Future<void> _readWarehouseLimits(String warehouseId) async {
    final session = _session;
    try {
      final profile = await _warehouseRepository.getWarehouseProfile(warehouseId);
      // Dropped when the cart moved on while this was in the air: a sign-out,
      // or a switch to another warehouse (whose own read is already running).
      if (isClosed || session != _session || state.warehouseId != warehouseId) return;
      emit(
        state.copyWith(
          minOrderAmountUsd: profile.minOrderAmountUsd,
          maxOrderAmountUsd: profile.maxOrderAmountUsd,
          clearMaxOrderAmount: profile.maxOrderAmountUsd == null,
          limitsFetchedAt: _now(),
        ),
      );
    } catch (_) {
      // See above - intentionally ignored; whatever limits the state already
      // holds stand. limitsFetchedAt is untouched too, so the next resume (or
      // screen open) tries again rather than waiting out another TTL on
      // figures that were never actually confirmed.
    }
  }

  bool hasConflictingWarehouse(String warehouseId) =>
      state.items.isNotEmpty && state.warehouseId != warehouseId;

  void addProduct(
    ProductModel product, {
    required String warehouseId,
    required String warehouseName,
    required int quantity,
  }) {
    // One-warehouse-per-order (Section 6.6): addProduct must never build a
    // mixed cart. The UI resolves a cross-warehouse add first - confirm
    // dialog, then replaceWithProduct - so on the normal path this is never
    // true. It's here so the invariant holds at the cubit level regardless
    // of the caller: a skipped check yields a no-op, not a corrupted cart.
    if (hasConflictingWarehouse(warehouseId)) return;

    final existingIndex = state.items.indexWhere((item) => item.productId == product.id);
    final List<CartItem> updated;
    if (existingIndex >= 0) {
      final existing = state.items[existingIndex];
      updated = List.of(state.items)
        ..[existingIndex] = existing.copyWith(quantity: existing.quantity + quantity);
    } else {
      updated = [...state.items, CartItem.fromProduct(product, quantity: quantity)];
    }
    final warehouseChanged = state.warehouseId != warehouseId;
    emit(
      _costChanged(state.copyWith(
        warehouseId: warehouseId,
        warehouseName: warehouseName,
        items: updated,
        // A different cart now - see CartState.pendingIdempotencyKey.
        clearPendingIdempotencyKey: true,
        clearError: true,
      )),
    );
    if (warehouseChanged) _loadWarehouseLimits(warehouseId);
    _scheduleRequote();
  }

  // Used after the pharmacist confirms replacing a cart that has items from
  // a different warehouse (see hasConflictingWarehouse).
  void replaceWithProduct(
    ProductModel product, {
    required String warehouseId,
    required String warehouseName,
    required int quantity,
  }) {
    // A new cart: any discount code applied to the old one goes with it.
    _cancelQuote();
    emit(
      CartState(
        warehouseId: warehouseId,
        warehouseName: warehouseName,
        items: [CartItem.fromProduct(product, quantity: quantity)],
      ),
    );
    _loadWarehouseLimits(warehouseId);
    _quoteNewCart();
  }

  // "Reorder an existing order": replaces the whole cart with a past order's
  // contents, bound to that order's own warehouse (Section 4 - the warehouse
  // comes from the trusted server payload, never client input). Same
  // one-warehouse-per-cart invariant as replaceWithProduct; the caller
  // (ReorderButton) resolves any "you already have a cart" confirmation first.
  // `items` are already priced with the current catalog price by the server -
  // no historical prices are carried over, and checkout re-validates every
  // line as usual.
  void loadReorder({
    required String warehouseId,
    required String warehouseName,
    required List<CartItem> items,
  }) {
    _cancelQuote();
    emit(
      CartState(
        warehouseId: warehouseId,
        warehouseName: warehouseName,
        items: List.of(items),
      ),
    );
    _loadWarehouseLimits(warehouseId);
    _quoteNewCart();
  }

  // "Add a package to the cart": a package behaves exactly like a product -
  // ONE line, whose quantity is the number of copies. Adding the same package
  // again bumps that line's copies rather than creating a second one, which is
  // the same rule addProduct applies to a repeated product.
  //
  // The products inside the package are never separate lines: the server
  // builds the real order lines from the package itself at checkout, so the
  // cart only ever names it and says how many.
  void addPackage(
    CartItem packageLine, {
    required String warehouseId,
    required String warehouseName,
  }) {
    if (hasConflictingWarehouse(warehouseId)) return;

    final existingIndex = state.items.indexWhere(
      (item) => item.isPackage && item.packageId == packageLine.packageId,
    );
    final List<CartItem> updated;
    if (existingIndex >= 0) {
      final existing = state.items[existingIndex];
      updated = List.of(state.items)
        ..[existingIndex] = existing.copyWith(
          quantity: existing.quantity + packageLine.quantity,
        );
    } else {
      updated = [...state.items, packageLine];
    }

    final warehouseChanged = state.warehouseId != warehouseId;
    emit(
      _costChanged(state.copyWith(
        warehouseId: warehouseId,
        warehouseName: warehouseName,
        items: updated,
        clearPendingIdempotencyKey: true,
        clearError: true,
      )),
    );
    if (warehouseChanged) _loadWarehouseLimits(warehouseId);
    _scheduleRequote();
  }

  /// Replaces the whole cart with a single package, for the "your cart holds
  /// another warehouse's items" path - the same shape replaceWithProduct has.
  void replaceWithPackage(
    CartItem packageLine, {
    required String warehouseId,
    required String warehouseName,
  }) {
    _cancelQuote();
    emit(
      CartState(
        warehouseId: warehouseId,
        warehouseName: warehouseName,
        items: [packageLine],
      ),
    );
    _loadWarehouseLimits(warehouseId);
    _quoteNewCart();
  }

  // Packages the server has reported as no longer available - paused by their
  // warehouse or an admin after they went into the cart. The lines are kept,
  // not dropped: the tile explains what happened and the pharmacist decides to
  // remove them. Nothing here blocks checkout; the server refuses them there.
  //
  // Keeps the idempotency key: the flag is display-only and never sent, so the
  // request this cart would make is unchanged.
  void markPackagesUnavailable(Iterable<String> packageIds) {
    final ids = packageIds.toSet();
    final needsFlag = state.items.any(
      (item) => item.isPackage && item.isAvailable && ids.contains(item.packageId),
    );
    if (!needsFlag) return;
    emit(state.copyWith(items: _flagUnavailablePackages(ids)));
  }

  /// The one-tap way out of a PACKAGE_UNAVAILABLE refusal: drops every package
  /// line flagged unavailable and leaves the rest of the cart as it was.
  void removeUnavailablePackages() {
    final updated = state.items.where((item) => !(item.isPackage && !item.isAvailable)).toList();
    if (updated.length == state.items.length) return;
    if (updated.isEmpty) {
      _cancelQuote();
      emit(const CartState());
      return;
    }
    emit(_costChanged(state.copyWith(items: updated, clearPendingIdempotencyKey: true)));
    _scheduleRequote();
  }

  List<CartItem> _flagUnavailablePackages(Set<String> packageIds) => state.items
      .map((item) => item.isPackage && packageIds.contains(item.packageId)
          ? item.copyWith(isAvailable: false)
          : item)
      .toList();

  // A PRICE_CHANGED refusal names every loose line whose price moved, with the
  // price the server will actually charge (order.service.js). Each one lands on
  // its own line; packages are never price-checked, so a package line is never
  // matched. The line keeps the price the pharmacist had been shown until they
  // confirm the new one (see submitOrder).
  //
  // Both prices take the new figure. The server sends only the final unit
  // price, not the pre-discount one, so there is no knowing whether an offer
  // still applies - and the old "was" price beside a HIGHER new price would
  // read as a discount. A repriced line therefore shows no struck-through
  // price.
  //
  // `changed` is whether a price that gets sent moved at all, which is what
  // decides the idempotency key, exactly as for any other edit.
  ({List<CartItem> items, bool changed}) _applyPriceChanges(Object? problems) {
    final currentPriceByProductId = <String, num>{};
    // The rest of each problem (catalog overhaul Phase 7, sent by a current
    // backend): the lira price the order would charge, the rate it was priced
    // at, and the discount inputs - so the repriced line shows exactly that.
    final problemByProductId = <String, Map>{};
    if (problems is List) {
      for (final problem in problems) {
        if (problem is! Map) continue;
        final productId = problem['productId'];
        final currentPriceUsd = problem['currentPriceUsd'];
        if (productId is String && currentPriceUsd is num) {
          currentPriceByProductId[productId] = currentPriceUsd;
          problemByProductId[productId] = problem;
        }
      }
    }

    var changed = false;
    final items = state.items.map((item) {
      final currentPriceUsd = currentPriceByProductId[item.productId];
      if (item.isPackage || currentPriceUsd == null || currentPriceUsd == item.discountPriceUsd) {
        return item;
      }
      changed = true;
      final problem = problemByProductId[item.productId]!;
      final hasInputs = problem.containsKey('offerDiscountPercentage');
      return item.copyWith(
        discountPriceUsd: currentPriceUsd,
        previousPriceUsd: item.previousPriceUsd ?? item.discountPriceUsd,
        finalPriceSyp: problem['currentPriceSyp'] as num?,
        priceRate: problem['priceRate'] as num?,
        // The undiscounted price as the server sent it; an older backend sent
        // none, and the old behaviour treated the new price as both.
        unitPriceUsd: (problem['priceUsd'] as num?) ?? currentPriceUsd,
        hasDiscountInputs: hasInputs,
        offerDiscountPercentage: problem['offerDiscountPercentage'] as num?,
        manufacturerDiscountPercentage: problem['manufacturerDiscountPercentage'] as num?,
      );
    }).toList();
    return (items: items, changed: changed);
  }

  // A BONUS_CHANGED refusal names every loose line whose bonus moved, with the
  // current tiers: each takes them and waits for the pharmacist to confirm
  // (catalog overhaul Phase 8) - the same path a repriced line follows.
  List<CartItem> _applyBonusChanges(Object? problems) {
    final currentByProductId = <String, List<BonusTier>>{};
    if (problems is List) {
      for (final problem in problems) {
        if (problem is! Map) continue;
        final productId = problem['productId'];
        if (productId is String) {
          currentByProductId[productId] = BonusTier.listFromJson(problem['currentBonuses']);
        }
      }
    }
    return state.items.map((item) {
      final current = currentByProductId[item.productId];
      if (item.isPackage || current == null) return item;
      return item.copyWith(bonuses: current, previousBonuses: item.previousBonuses ?? item.bonuses);
    }).toList();
  }

  // Works the same for a product line and a package line: for a package the
  // number IS the copy count. There is no "breaking a package" any more - its
  // contents are not cart lines, so nothing can be taken out of one.
  //
  // The idempotency key goes only when the quantity really moves. The stepper
  // and its typed field can report the value a line already has (a clamped 0,
  // a re-typed number), and dropping the key for that would let a retry after
  // a lost response place the same order twice.
  void updateQuantity(String lineKey, int quantity) {
    final clamped = quantity < 1 ? 1 : quantity;
    final changed = state.items.any(
      (item) => item.lineKey == lineKey && item.quantity != clamped,
    );
    final updated = state.items.map((item) {
      if (item.lineKey != lineKey) return item;
      return item.copyWith(quantity: clamped);
    }).toList();
    final next = state.copyWith(items: updated, clearPendingIdempotencyKey: changed);
    emit(changed ? _costChanged(next) : next);
    if (changed) _scheduleRequote();
  }

  void removeItem(String lineKey) {
    final updated = state.items.where((item) => item.lineKey != lineKey).toList();
    if (updated.isEmpty) {
      _cancelQuote();
      emit(const CartState());
      return;
    }
    final removed = updated.length != state.items.length;
    final next = state.copyWith(items: updated, clearPendingIdempotencyKey: removed);
    emit(removed ? _costChanged(next) : next);
    if (removed) _scheduleRequote();
  }

  // "Clear the cart": drops every line at once. Resets to a pristine
  // CartState rather than just emptying `items` - exactly what removeItem
  // already does when the last line goes - so the warehouse binding, the
  // notes, any advertisement package and the loaded order limits all go with
  // it. Nothing is sent to the server: the cart only exists on the client
  // until submitOrder.
  void clearCart() {
    if (state.isEmpty) return;
    _cancelQuote();
    emit(const CartState());
  }

  // Called on every keystroke. Only the trimmed text is ever sent (see
  // submitOrder), so that is what decides whether the idempotency key goes: a
  // call that leaves it as it was (a trailing space) keeps the key. Any real
  // change drops it, and it is not restored if the change is later undone.
  void updateNotes(String notes) => emit(
    state.copyWith(
      notes: notes,
      clearPendingIdempotencyKey: notes.trim() != state.notes.trim(),
    ),
  );

  // Client-side availability snapshots (taken when items were added) can go
  // stale by the time the pharmacist actually submits - the server re-checks
  // isAvailable for real (Section 7/8) and this surfaces whatever
  // human-readable message it returns.
  //
  // `acceptPriceChanges`: the pharmacist has seen the prices the server
  // changed and agreed to them. Only CartView's price-change dialog passes it.
  //
  // `rateUsed`: the USD->SYP rate the totals on screen were converted at, read
  // from ExchangeRateCubit by the view that submits. It is sent so the server
  // can refuse an order agreed to at a rate that has since moved (409
  // RATE_CHANGED, handled by CartView's own confirmation dialog). It is
  // deliberately not part of what identifies this cart: the idempotency key
  // survives a rate change, because nothing about what is being ordered
  // changed.
  Future<OrderModel?> submitOrder({
    bool acceptPriceChanges = false,
    double? rateUsed,
  }) async {
    if (state.warehouseId == null) return null;
    // Unreachable through the normal UI (CartView swaps to its empty-cart
    // view once items.isEmpty), but a real, user-visible message here rather
    // than a silent no-op covers any edge case that still reaches this call
    // - e.g. the last item being removed in the gap between tapping submit
    // and this running.
    if (state.items.isEmpty) {
      emit(state.copyWith(errorMessage: 'Your cart is empty.', errorCode: 'CART_EMPTY'));
      return null;
    }
    // The submit button is held while a quote is in the air, or while the
    // figures on screen are not the server's for this cart
    // (CartState.isReadyToSubmit); this is the backstop for the one case the
    // order itself depends on - a code needs the revision it was quoted at.
    if (state.isQuoting || (state.discountCode != null && !state.hasCurrentQuote)) {
      return null;
    }

    // A line the server repriced (or whose bonus changed) is never sent on
    // the strength of the pharmacist's earlier confirmation - that one was for
    // the old terms. `acceptPriceChanges` accepts both.
    if (state.hasUnconfirmedPriceChanges || state.hasUnconfirmedBonusChanges) {
      if (!acceptPriceChanges) {
        // CartView routes a submit to its confirmation dialog before it gets
        // here; this is the backstop. The error is cleared first so the
        // listener shows that dialog even if this repeats.
        emit(state.copyWith(clearError: true));
        emit(state.copyWith(
          errorMessage: 'Confirm the new prices before submitting.',
          errorCode: state.hasUnconfirmedPriceChanges ? 'PRICE_CHANGE_UNCONFIRMED' : 'BONUS_CHANGE_UNCONFIRMED',
        ));
        return null;
      }
      // Accepting changes nothing that is sent - the lines already carry the
      // new prices and bonuses - so the idempotency key is left as it is.
      emit(state.copyWith(
        items: [
          for (final item in state.items)
            item.hasUnconfirmedPriceChange || item.hasUnconfirmedBonusChange
                ? item.copyWith(clearPreviousPrice: true, clearPreviousBonuses: true)
                : item,
        ],
      ));
    }

    // Money-Flow V2 idempotency: minted on the FIRST attempt only and kept in
    // the state, so every retry of this same cart carries the same key and
    // the server returns the order the first attempt created instead of
    // placing a second one. Generating it inside the request below would give
    // each retry a fresh key and defeat the whole mechanism. It's cleared
    // with the cart itself, on success or on any reset to a bare CartState,
    // and by every edit that changes what this request would send - the key
    // stands for one exact cart, and the server refuses it for any other
    // (IDEMPOTENCY_KEY_REUSED).
    final idempotencyKey = state.pendingIdempotencyKey ?? _uuid.v4();
    emit(state.copyWith(
      isSubmitting: true,
      pendingIdempotencyKey: idempotencyKey,
      clearError: true,
    ));
    // The account this request is sent for. If it signs out before the answer
    // arrives, the answer is dropped: a success would otherwise empty the next
    // account's cart, and a refusal would land its error (or its repriced
    // lines) there. The order itself, if one was placed, belongs to the
    // account that sent it and shows up in that account's order list.
    //
    // Dropping it is silent on purpose, and was accepted as such: this returns
    // null with nothing on screen, so a pharmacist who signed out mid-submit is
    // never told whether that last tap placed an order. Telling them would mean
    // surfacing another account's result on this one's session, which is the
    // leak the reset exists to prevent.
    final session = _session;
    try {
      final order = await _orderRepository.submitOrder(
        warehouseId: state.warehouseId!,
        items: state.items,
        notes: state.notes.trim().isEmpty ? null : state.notes.trim(),
        // The repository splits `items` into loose product lines and packages:
        // a package crosses the wire as { advertisementId, copies } and
        // nothing else, and the server prices it from its own record.
        idempotencyKey: idempotencyKey,
        rateUsed: rateUsed,
        // With the revision it was quoted at: if the code's amount changed
        // since, the server refuses (DISCOUNT_CODE_CHANGED) rather than charge
        // a total the pharmacist never saw. Not part of the idempotency key's
        // identity beyond the code itself - the server fingerprints the code.
        discountCode: state.discountCode,
        discountCodeRevision: state.quote?.revision,
      );
      if (session != _session) return null;
      _cancelQuote();
      emit(const CartState());
      return order;
    } on Failure catch (f) {
      if (session != _session) return null;
      if (f.code == 'DISCOUNT_CODE_CHANGED' || isDiscountCodeRefusal(f.code)) {
        await _handleDiscountCodeRefusal(f, session);
        return null;
      }
      if (f.code == 'RATE_CHANGED') {
        await _handleRateChanged(f, session);
        return null;
      }
      // Both refusals below rewrite lines in this same emit, so the lines and
      // the dialog explaining them reach the screen together.
      //
      // PACKAGE_UNAVAILABLE names the refused packages, which get flagged.
      // PRICE_CHANGED names the lines whose price moved, which take the new
      // price and wait for the pharmacist to confirm it.
      List<CartItem>? updatedItems;
      var pricesChanged = false;
      if (f.code == 'PRICE_CHANGED') {
        final repriced = _applyPriceChanges(f.details?['problems']);
        updatedItems = repriced.items;
        pricesChanged = repriced.changed;
      } else if (f.code == 'BONUS_CHANGED') {
        updatedItems = _applyBonusChanges(f.details?['problems']);
      } else if (f.code == 'PACKAGE_UNAVAILABLE') {
        final refusedPackageIds = ((f.details?['advertisementIds'] as List?) ?? const [])
            .map((id) => id.toString())
            .toSet();
        if (refusedPackageIds.isNotEmpty) {
          updatedItems = _flagUnavailablePackages(refusedPackageIds);
        }
      }
      // The same principle the repriced lines follow: when the server refuses
      // on a limit it names the limit it applied, so the cart adopts it rather
      // than keeping the figure that let this submit through. The banner and
      // the submit button then tell the truth immediately, without waiting for
      // the next re-read. Only the limit the refusal names is touched - the
      // other one is not in the refusal and must keep its value.
      final num? refusedMinimum = f.code == 'ORDER_BELOW_MINIMUM'
          ? (f.details?['minOrderAmountUsd'] as num?)
          : null;
      final num? refusedMaximum = f.code == 'ORDER_ABOVE_MAXIMUM'
          ? (f.details?['maxOrderAmountUsd'] as num?)
          : null;
      final refused = state.copyWith(
          items: updatedItems,
          minOrderAmountUsd: refusedMinimum,
          maxOrderAmountUsd: refusedMaximum,
          // The same rule every edit follows: the key names one exact cart.
          // A repriced line sends a different price, so its key goes, just as
          // updateQuantity drops it for a different quantity. (No order holds
          // it - a PRICE_CHANGED refusal is issued before anything is placed -
          // so this keeps the key honest rather than being what unblocks the
          // retry; the new prices are.)
          //
          // IDEMPOTENCY_KEY_REUSED: the server already holds an order for this
          // key, placed from a different cart (only an app that kept its key
          // across an edit gets here). The error tells the pharmacist;
          // dropping the key is what lets their next tap place this cart as
          // the new order it is.
          clearPendingIdempotencyKey: pricesChanged || f.code == 'IDEMPOTENCY_KEY_REUSED',
          isSubmitting: false,
          errorMessage: f.errMessage,
          errorCode: f.code,
          errorDetails: f.details,
        );
      // Repriced lines change what the cart costs.
      emit(pricesChanged ? _costChanged(refused) : refused);
      if (pricesChanged) _scheduleRequote();
      return null;
    } catch (e) {
      // Anything that isn't a Failure (e.g. a response-parsing bug) must
      // still land the cubit in a terminal state - otherwise isSubmitting
      // stays true forever and the submit button spins with no error ever
      // shown (the "submit order freezes" report this fixes).
      if (session != _session) return null;
      emit(state.copyWith(isSubmitting: false, errorMessage: 'Unexpected error', errorCode: 'UNEXPECTED_ERROR'));
      return null;
    }
  }

  // The order was refused over the discount code - no order was placed.
  //
  // DISCOUNT_CODE_EDITED: the code still works, but its amount changed since
  // the cart quoted it. It is re-quoted right here, so the dialog explaining
  // it (CartView) already shows the new discount and total, and the next
  // submit carries the new revision. The code is unchanged, so the idempotency
  // key stays - exactly like a RATE_CHANGED refusal.
  //
  // Any other reason (stopped, expired, used up...): the code comes off the
  // cart with the reason under the field, and the pharmacist sees the total
  // without it before submitting again. What would be sent changed, so the
  // key goes.
  Future<void> _handleDiscountCodeRefusal(Failure f, int session) async {
    final reason = (f.details?['reason'] as String?) ?? f.code;
    final code = state.discountCode;

    if (reason == 'DISCOUNT_CODE_EDITED' && code != null) {
      final fresh = await _freshQuote(session);
      if (isClosed || session != _session) return;
      if (fresh.quote != null) {
        emit(state.copyWith(
          quote: fresh.quote,
          isQuoting: false,
          isQuoteStale: false,
          isSubmitting: false,
          errorMessage: f.errMessage,
          errorCode: 'DISCOUNT_CODE_CHANGED',
          errorDetails: f.details,
        ));
        return;
      }
      // The re-quote itself refused the code (or failed): take it off, with
      // the newest reason.
      _removeRefusedCode(f, isDiscountCodeRefusal(fresh.errorCode) ? fresh.errorCode : reason);
      return;
    }
    _removeRefusedCode(f, reason);
  }

  void _removeRefusedCode(Failure f, String? reason) {
    _cancelQuote();
    emit(state.copyWith(
      clearDiscountCode: true,
      isQuoting: false,
      isQuoteStale: true,
      discountCodeErrorCode: reason,
      clearPendingIdempotencyKey: true,
      isSubmitting: false,
      errorMessage: f.errMessage,
      errorCode: 'DISCOUNT_CODE_CHANGED',
      errorDetails: {...?f.details, 'reason': reason},
    ));
    // The figures on screen included the code: quote the cart without it.
    if (_quoteViewers > 0) refreshQuote();
  }

  // RATE_CHANGED: the rate the pharmacist confirmed at has moved on the
  // server. Nothing was ordered and nothing about the cart changed, so the
  // idempotency key stays. The cart is re-quoted right here - at the server's
  // rate - so the dialog (CartView) sets the new total beside the one that was
  // on screen, both the server's figures with the platform discount and any
  // code discount in them: `previousTotalSyp` and `currentTotalSyp` in the
  // refusal's details. Without a fresh quote (the network) there are no
  // totals to show; the summary offers a retry.
  Future<void> _handleRateChanged(Failure f, int session) async {
    final previousTotal = state.quote?.finalSyp;
    final fresh = await _freshQuote(session);
    if (isClosed || session != _session) return;
    final quote = fresh.quote;
    emit(state.copyWith(
      quote: quote,
      isQuoting: false,
      isQuoteStale: quote == null,
      quoteErrorCode: quote == null ? fresh.errorCode : null,
      clearQuoteError: quote != null,
      isSubmitting: false,
      errorMessage: f.errMessage,
      errorCode: 'RATE_CHANGED',
      errorDetails: {
        ...?f.details,
        if (quote != null && previousTotal != null) 'previousTotalSyp': previousTotal,
        if (quote != null && previousTotal != null) 'currentTotalSyp': quote.finalSyp,
      },
    ));
  }

  // A quote for the cart as it stands, taken during a refusal - null (with
  // the reason) when it could not be had, or when the cart moved on while it
  // was in the air.
  Future<({CartQuote? quote, String? errorCode})> _freshQuote(int session) async {
    final warehouseId = state.warehouseId;
    if (warehouseId == null || state.isEmpty) return (quote: null, errorCode: null);
    _requoteTimer?.cancel();
    final request = ++_quoteRequest;
    try {
      final quote = await _orderRepository.quoteCart(
        warehouseId: warehouseId,
        items: state.items,
        code: state.discountCode,
      );
      if (_isStaleQuote(request, session, warehouseId)) return (quote: null, errorCode: null);
      return (quote: quote, errorCode: null);
    } on Failure catch (failure) {
      return (quote: null, errorCode: failure.code ?? 'UNEXPECTED_ERROR');
    } catch (_) {
      return (quote: null, errorCode: 'UNEXPECTED_ERROR');
    }
  }
}
