import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/config/app_features.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/theme/app_text_theme.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/app_dialog.dart';
import 'package:feniq/core/widgets/app_snackbar.dart';
import 'package:feniq/core/widgets/app_text_field.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/catalog/data/models/bonus_tier.dart';
import 'package:feniq/features/cart/presentation/managers/cart_state.dart';
import 'package:feniq/features/cart/presentation/utils/cart_error_translator.dart';
import 'package:feniq/features/cart/presentation/widgets/cart_item_tile.dart';
import 'package:feniq/features/cart/presentation/widgets/discount_code_field.dart';
import 'package:feniq/features/catalog/data/models/manufacturers_route_args.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/core/widgets/full_text.dart';

class CartView extends StatefulWidget {
  const CartView({super.key});

  @override
  State<CartView> createState() => _CartViewState();
}

class _CartViewState extends State<CartView> {
  late final TextEditingController _notesController;
  // Held for dispose, where the context can no longer look it up.
  late final CartCubit _cartCubit;

  @override
  void initState() {
    super.initState();
    _cartCubit = context.read<CartCubit>();
    _notesController = TextEditingController(text: _cartCubit.state.notes);
    // The limits gate the submit button, and the warehouse can change them
    // while a cart sits open - so they are re-read every time this screen is
    // opened, not just when the cart first pointed at the warehouse. Nothing
    // waits on it: the cart renders from what it already has and the limit
    // line picks up the new figures when they land.
    //
    // The summary shows the server's figures for this cart (the quote), so the
    // screen asks for them as it opens - unless the ones on hand are already
    // current - and the cubit keeps them current while the screen shows.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _cartCubit.refreshWarehouseLimits();
      _cartCubit.attachQuoteView();
    });
  }

  @override
  void dispose() {
    _cartCubit.detachQuoteView();
    _notesController.dispose();
    super.dispose();
  }

  String _describeError(CartState state) {
    final l10n = context.l10n;

    // The refused packages are already flagged on their lines by the time this
    // runs (CartCubit.submitOrder), so their names come off the cart itself.
    if (state.errorCode == 'PACKAGE_UNAVAILABLE') {
      final isArabic = Localizations.localeOf(context).languageCode == 'ar';
      return describeUnavailablePackages(l10n, isArabic, state.items);
    }

    if (state.errorCode == 'STOCK_CHECK_FAILED') {
      final problems = (state.errorDetails?['problems'] as List?)
          ?.cast<Map<String, dynamic>>();
      if (problems != null && problems.isNotEmpty) {
        final isArabic = Localizations.localeOf(context).languageCode == 'ar';
        return describeStockProblems(l10n, isArabic, problems, state.items);
      }
    }

    // The server sends the limit back in details (order.service.js) so the
    // rejection reads with the real figure even though the English message
    // it ships with is only a fallback. The limit is USD-denominated on the
    // server; shown in SYP here at the live rate, like every other amount.
    final usdToSyp = context.read<ExchangeRateCubit>().state.usdToSyp;

    // Same per-item shape as STOCK_CHECK_FAILED, but the prices inside it are
    // USD (the catalog's native currency) and are shown in SYP here, so this
    // one needs the rate that was just read above.
    if (state.errorCode == 'PRICE_CHANGED') {
      final problems = (state.errorDetails?['problems'] as List?)
          ?.cast<Map<String, dynamic>>();
      if (problems != null && problems.isNotEmpty) {
        final isArabic = Localizations.localeOf(context).languageCode == 'ar';
        return describePriceProblems(
          l10n,
          isArabic,
          problems,
          state.items,
          (amount) => formatMoneyFromUsd(amount, usdToSyp, l10n.currencySuffix),
        );
      }
    }
    if (state.errorCode == 'ORDER_BELOW_MINIMUM') {
      final amount = state.errorDetails?['minOrderAmountUsd'];
      if (amount is num) {
        return l10n.orderBelowMinimum(formatMoneyFromUsd(amount, usdToSyp, l10n.currencySuffix));
      }
    }
    if (state.errorCode == 'ORDER_ABOVE_MAXIMUM') {
      final amount = state.errorDetails?['maxOrderAmountUsd'];
      if (amount is num) {
        return l10n.orderAboveMaximum(formatMoneyFromUsd(amount, usdToSyp, l10n.currencySuffix));
      }
    }

    return translateErrorCode(
      l10n,
      state.errorCode,
      state.errorMessage ?? l10n.errorState,
    );
  }

  // Empties the whole cart in one step, behind a confirmation - it drops
  // every line, the warehouse binding and any package along with them, so it
  // is not something to trigger by a stray tap. Purely local: nothing is sent
  // to the server, the cart has no server-side existence until submitOrder.
  Future<void> _confirmClearCart() async {
    final l10n = context.l10n;
    final cubit = context.read<CartCubit>();

    await AppDialog.show(
      context: context,
      title: l10n.clearCartTitle,
      content: l10n.clearCartConfirmation,
      actionLabel: l10n.clearCartButton,
      onAction: () {
        cubit.clearCart();
        // The notes field is uncontrolled by the cubit (the controller is
        // seeded once in initState), so clearing the state's notes has to
        // clear the controller too or a stale draft would come back with the
        // next item added.
        _notesController.clear();
      },
    );
  }

  Future<void> _confirmSubmit() async {
    final l10n = context.l10n;
    final cubit = context.read<CartCubit>();

    // Prices the server changed need their own confirmation - the generic one
    // below says nothing about them.
    if (cubit.state.hasUnconfirmedPriceChanges) {
      await _confirmPriceChanges();
      return;
    }
    // Same for a bonus the server changed (catalog overhaul Phase 8).
    if (cubit.state.hasUnconfirmedBonusChanges) {
      await _confirmBonusChanges();
      return;
    }

    final warehouseName = cubit.state.warehouseName ?? '';

    await AppDialog.show(
      context: context,
      title: l10n.submitOrderTitle,
      content: l10n.submitOrderConfirmation(warehouseName),
      actionLabel: l10n.submitOrderButton,
      onAction: () => _submit(cubit),
    );
  }

  // After a PRICE_CHANGED refusal the lines already carry the new prices; this
  // is the only way to send them. It lists each change (old -> new) and its
  // action submits with acceptPriceChanges. "Close" sends nothing: the lines
  // keep their new prices, and the submit button brings this dialog back until
  // the pharmacist accepts.
  Future<void> _confirmPriceChanges() async {
    final l10n = context.l10n;
    final cubit = context.read<CartCubit>();
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final usdToSyp = context.read<ExchangeRateCubit>().state.usdToSyp;

    await AppDialog.show(
      context: context,
      title: l10n.errorPriceChangedGeneric,
      content: describePriceProblems(
        l10n,
        isArabic,
        cubit.state.unconfirmedPriceChanges,
        cubit.state.items,
        (amount) => formatMoneyFromUsd(amount, usdToSyp, l10n.currencySuffix),
      ),
      actionLabel: l10n.submitOrderButton,
      onAction: () => _submit(cubit, acceptPriceChanges: true),
    );
  }

  // After a BONUS_CHANGED refusal: the lines already carry the product's
  // current bonus; this lists them so the pharmacist sees the new terms before
  // anything is resent (the action accepts them and submits).
  Future<void> _confirmBonusChanges() async {
    final l10n = context.l10n;
    final cubit = context.read<CartCubit>();
    final lines = [
      for (final item in cubit.state.items)
        if (item.hasUnconfirmedBonusChange)
          l10n.bonusChangedLine(
            item.displayName(true),
            item.bonuses.isEmpty ? l10n.noBonus : l10n.bonusValue(BonusTier.format(item.bonuses)),
          ),
    ];
    await AppDialog.show(
      context: context,
      title: l10n.errorBonusChangedGeneric,
      content: lines.join('\n'),
      actionLabel: l10n.submitOrderButton,
      onAction: () => _submit(cubit, acceptPriceChanges: true),
    );
  }

  // After a RATE_CHANGED refusal: the rate the pharmacist agreed to had
  // already moved on the server. The cubit has re-quoted the cart at the new
  // rate, so both totals here are the server's - the new one and the one that
  // was on screen, each with the platform discount and any code discount in
  // it. The rate itself is re-read in the background so every other screen
  // stops showing the old one. Nothing is resent until the action here is
  // tapped - "Close" sends nothing and the submit button brings the ordinary
  // confirmation back, over the new figures now on screen.
  Future<void> _confirmRateChange(CartState state) async {
    final l10n = context.l10n;
    final cubit = context.read<CartCubit>();
    final details = state.errorDetails ?? const {};
    final currentRate = (details['currentUsdToSyp'] as num?)?.toDouble();
    if (currentRate == null || currentRate <= 0) return;

    // The rate this cart would now be converted at, everywhere in the app.
    unawaited(context.read<ExchangeRateCubit>().load());

    final newTotal = details['currentTotalSyp'] as num?;
    final oldTotal = details['previousTotalSyp'] as num?;
    if (newTotal == null || oldTotal == null) {
      // No fresh quote (the network): nothing honest to put in the dialog.
      // The summary shows the retry; the pharmacist submits again from there.
      await AppDialog.show(
        context: context,
        title: l10n.errorRateChangedTitle,
        content: l10n.cartQuoteUnavailable,
      );
      return;
    }
    await AppDialog.show(
      context: context,
      title: l10n.errorRateChangedTitle,
      content: '${l10n.rateChangedTotals(
        formatSyp(newTotal, l10n.currencySuffix),
        formatSyp(oldTotal, l10n.currencySuffix),
      )}\n\n${l10n.rateChangedConfirmHint}',
      actionLabel: l10n.submitOrderButton,
      onAction: () => _submit(cubit, rateUsed: currentRate),
    );
  }

  // After a DISCOUNT_CODE_CHANGED refusal - nothing was ordered. Either the
  // code still works on new terms (EDITED: the cubit already re-quoted it, so
  // this names the new discount and total and can submit at once), or it no
  // longer works and has come off the cart (the reason says why, and the
  // pharmacist looks at the total without it before submitting again).
  Future<void> _showDiscountCodeChanged(CartState state) async {
    final l10n = context.l10n;
    final cubit = context.read<CartCubit>();
    final reason = state.errorDetails?['reason'] as String?;
    final quote = state.quote;

    if (reason == 'DISCOUNT_CODE_EDITED' && quote != null && state.discountCode != null) {
      await AppDialog.show(
        context: context,
        title: l10n.discountCodeChangedTitle,
        content: l10n.discountCodeEditedMessage(
          state.discountCode!,
          formatSyp(quote.discountSyp, l10n.currencySuffix),
          formatSyp(quote.finalSyp, l10n.currencySuffix),
        ),
        actionLabel: l10n.submitOrderButton,
        onAction: () => _submit(cubit),
      );
      return;
    }
    await AppDialog.show(
      context: context,
      title: l10n.discountCodeChangedTitle,
      content: l10n.discountCodeRemovedMessage(
        translateErrorCode(l10n, reason, l10n.errorDiscountCodeInvalid),
      ),
    );
  }

  // Every warehouse's cart, each named with its line count - the one in
  // front first, as "Send all" goes through them.
  String _cartNames(CartState state) {
    final l10n = context.l10n;
    return [
      for (final cart in [state, ...state.otherCarts.values])
        '• ${cart.warehouseName ?? ''} (${l10n.catalogItemsCountSubtitle(cart.itemCount)})',
    ].join('\n');
  }

  Future<void> _confirmSubmitAll() async {
    final l10n = context.l10n;
    final cubit = context.read<CartCubit>();
    await AppDialog.show(
      context: context,
      title: l10n.submitAllTitle,
      content: l10n.submitAllConfirmation(_cartNames(cubit.state)),
      actionLabel: l10n.submitAllButton(cubit.state.cartCount),
      onAction: () => _submitAll(cubit),
    );
  }

  // One order per warehouse. All sent: to the orders list, where they all
  // are. Some refused: those carts stay, the first of them in front with its
  // reason (the listener shows it), and a line says how many went.
  Future<void> _submitAll(CartCubit cubit) async {
    final l10n = context.l10n;
    final total = cubit.state.cartCount;
    final result = await cubit.submitAll(fallbackRate: context.read<ExchangeRateCubit>().state.usdToSyp);
    if (!mounted) return;
    if (result.orders.isEmpty) return;
    if (result.refused == 0) {
      AppSnackbar.show(context, l10n.submitAllDone(result.orders.length));
      context.goNamed(RouteNames.myOrders);
      return;
    }
    AppSnackbar.show(context, l10n.submitAllPartial(result.orders.length, total));
  }

  Future<void> _submit(
    CartCubit cubit, {
    bool acceptPriceChanges = false,
    double? rateUsed,
  }) async {
    // AppDialog's own action button already pops its dialog (via
    // dialogContext + rootNavigator) before calling here - an extra
    // Navigator.pop(context) with this outer context popped CartView itself,
    // which is why the screen used to never actually reach the navigation
    // below (mounted went false mid-flight).
    //
    // The rate goes with the request: the rate the totals on this screen were
    // converted with - the quote's, since the summary shows the server's
    // figures - and the server refuses the order rather than billing a total
    // the pharmacist never saw (order.service.js).
    final order = await cubit.submitOrder(
      acceptPriceChanges: acceptPriceChanges,
      rateUsed: rateUsed ?? cubit.state.quote?.usdToSyp ?? context.read<ExchangeRateCubit>().state.usdToSyp,
    );
    if (!mounted) return;

    // Straight to order tracking on success - no intermediate "order
    // submitted" dialog to tap through, the tracking screen itself is the
    // confirmation.
    if (order != null) {
      context.goNamed(
        RouteNames.orderTracking,
        pathParameters: {'orderId': order.id},
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        toolbarHeight: 64,
        title: BlocBuilder<CartCubit, CartState>(
          buildWhen: (previous, current) =>
              previous.itemCount != current.itemCount ||
              previous.warehouseName != current.warehouseName,
          builder: (context, state) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FullText(l10n.cartTitle, minScale: 0.6),
                if (state.warehouseName != null)
                  FullText(
                    '${state.warehouseName} · ${l10n.catalogItemsCountSubtitle(state.itemCount)}',
                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.normal, color: Colors.white70), minScale: 0.6),
              ],
            );
          },
        ),
      ),
      body: BlocListener<CartCubit, CartState>(
        // Another warehouse's cart came to the front: the notes field shows
        // that cart's notes (the controller is only seeded once otherwise).
        listenWhen: (previous, current) => previous.warehouseId != current.warehouseId,
        listener: (context, state) {
          if (_notesController.text != state.notes) _notesController.text = state.notes;
        },
        child: BlocConsumer<CartCubit, CartState>(
        listenWhen: (previous, current) =>
            current.errorMessage != null &&
            previous.errorMessage != current.errorMessage &&
            // "Send all" shows the refused cart once it has been through them.
            !current.isSubmittingAll,
        listener: (context, state) {
          // Repriced lines get the dialog that can accept the new prices,
          // rather than an error with no way forward.
          final isPriceChange = state.errorCode == 'PRICE_CHANGED' ||
              state.errorCode == 'PRICE_CHANGE_UNCONFIRMED';
          if (isPriceChange && state.hasUnconfirmedPriceChanges) {
            _confirmPriceChanges();
            return;
          }
          final isBonusChange = state.errorCode == 'BONUS_CHANGED' ||
              state.errorCode == 'BONUS_CHANGE_UNCONFIRMED';
          if (isBonusChange && state.hasUnconfirmedBonusChanges) {
            _confirmBonusChanges();
            return;
          }

          // A rate that moved gets the same treatment as a price that moved:
          // the new figure and a fresh confirmation, not a dead-end error.
          if (state.errorCode == 'RATE_CHANGED' && state.errorDetails != null) {
            _confirmRateChange(state);
            return;
          }

          if (state.errorCode == 'DISCOUNT_CODE_CHANGED') {
            _showDiscountCodeChanged(state);
            return;
          }

          // A refused package gets its way out right in the dialog: one tap
          // removes every package the server turned away, instead of the
          // pharmacist hunting down each flagged line.
          final cubit = context.read<CartCubit>();
          final hasRefusedPackages = state.errorCode == 'PACKAGE_UNAVAILABLE' &&
              state.items.any((item) => item.isPackage && !item.isAvailable);
          AppDialog.show(
            context: context,
            title: hasRefusedPackages ? l10n.advertisementUnavailableTitle : l10n.errorState,
            content: _describeError(state),
            actionLabel: hasRefusedPackages ? l10n.removeUnavailablePackagesButton : null,
            onAction: hasRefusedPackages ? cubit.removeUnavailablePackages : null,
          );
        },
        builder: (context, state) {
          if (state.isEmpty) {
            return _EmptyCart(onBrowse: () => context.goNamed(RouteNames.warehouseSelection));
          }

          // The warehouse's order-size limits are USD-denominated on the
          // server (order.service.js); shown here in SYP at the live rate,
          // consistent with the subtotal they're compared against.
          final usdToSyp = context.watch<ExchangeRateCubit>().state.usdToSyp;
          String limitText(num usdAmount) =>
              formatMoneyFromUsd(usdAmount, usdToSyp, l10n.currencySuffix);

          return LayoutBuilder(
            builder: (context, box) => Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSizes.spacingMedium,
                    AppSizes.spacingMedium,
                    AppSizes.spacingMedium,
                    AppSizes.spacingLarge,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (state.hasOtherCarts) ...[
                        _WarehouseCartsStrip(state: state),
                        const SizedBox(height: AppSizes.spacingMedium),
                      ],
                      for (final item in state.items) ...[
                        CartItemTile(
                          item: item,
                          // A package line's quantity is its copy count, and
                          // its contents are not lines - so both callbacks are
                          // the same for a package as for a product.
                          onQuantityChanged: (quantity) =>
                              context.read<CartCubit>().updateQuantity(item.lineKey, quantity),
                          onRemove: () => context.read<CartCubit>().removeItem(item.lineKey),
                        ),
                        const SizedBox(height: AppSizes.spacingMedium),
                      ],
                      const SizedBox(height: AppSizes.spacingXSmall),
                      // Section 5: add more products to this cart. Scoped to
                      // the cart's own warehouse - the existing warehouse ->
                      // manufacturers -> catalog flow, entered at the cart's
                      // warehouseId, so a company from another warehouse can
                      // never be reached for this cart.
                      OutlinedButton.icon(
                        onPressed: state.warehouseId == null
                            ? null
                            : () => context.pushNamed(
                                  RouteNames.manufacturers,
                                  pathParameters: {'warehouseId': state.warehouseId!},
                                  extra: ManufacturersRouteArgs(
                                    warehouseName: state.warehouseName ?? '',
                                  ),
                                ),
                        icon: const Icon(Icons.add, size: 20),
                        label: Text(l10n.addProductButton),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.textOf(context),
                          side: BorderSide(color: AppColors.textOf(context)),
                          shape: const RoundedRectangleBorder(borderRadius: AppRadius.medium),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                      const SizedBox(height: AppSizes.spacingSmall + AppSizes.spacingXSmall),
                      // Only ever rendered with a non-empty cart: the empty
                      // cart takes the _EmptyCart branch above, so there is
                      // nothing to clear when this is not on screen.
                      OutlinedButton.icon(
                        onPressed: _confirmClearCart,
                        icon: const Icon(Icons.delete_outline, size: 20),
                        label: Text(l10n.clearCartButton),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.errorOf(context),
                          side: BorderSide(color: AppColors.errorOf(context)),
                          shape: const RoundedRectangleBorder(borderRadius: AppRadius.medium),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                      const SizedBox(height: AppSizes.spacingMedium),
                      AppTextField(
                        label: l10n.notesLabel,
                        controller: _notesController,
                        maxLines: 3,
                        onChanged: (value) =>
                            context.read<CartCubit>().updateNotes(value),
                      ),
                    ],
                  ),
                ),
              ),
              // The order summary sits on its own raised sheet, so the total
              // and the submit button read as one block, apart from the lines
              // scrolling above them.
              ConstrainedBox(
                // Its full height normally; at most 70% of the screen, so on
                // a small phone with the keyboard up it scrolls within itself
                // and the lines above keep some room.
                constraints: BoxConstraints(maxHeight: box.maxHeight * 0.7),
                child: Container(
                padding: const EdgeInsets.fromLTRB(
                  AppSizes.spacingMedium + AppSizes.spacingXSmall,
                  AppSizes.spacingMedium + AppSizes.spacingXSmall,
                  AppSizes.spacingMedium + AppSizes.spacingXSmall,
                  AppSizes.spacingMedium,
                ),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevatedOf(context),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: context.isDarkMode ? 0.3 : 0.08),
                      blurRadius: 16,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: SafeArea(
                  top: false,
                  // Scrolls within itself when space is tight (a small phone
                  // with the keyboard up): never past the screen edge.
                  child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // One code per order, right above the figures it
                      // changes - always in view (never under this sheet), and
                      // above the keyboard while it is typed.
                      if (AppFeatures.discountCodes) ...[
                        const DiscountCodeField(),
                        const SizedBox(height: AppSizes.spacingMedium),
                      ],
                      // The server's figures for this cart - subtotal,
                      // platform discount, any code discount, total - so
                      // what is on screen is what the order will cost.
                      _QuoteSummary(state: state),
                      // Section: this warehouse's order-size limits. Shown
                      // against the subtotal above - the same figure the
                      // backend checks (order.service.js) - so the hint, the
                      // button state and the server all agree. A warehouse
                      // with no limits set renders nothing extra at all.
                      if (state.minOrderAmountUsd > 0 || state.maxOrderAmountUsd != null) ...[
                        const SizedBox(height: AppSizes.spacingXSmall),
                        if (state.minOrderAmountUsd > 0)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Flexible(
                                child: Text(
                                  l10n.minOrderLabel(limitText(state.minOrderAmountUsd)),
                                  style: context.textTheme.bodySmall?.copyWith(
                                    color: state.isBelowMinimum
                                        ? AppColors.primaryOf(context)
                                        : AppColors.textSecondaryOf(context),
                                    fontWeight: state.isBelowMinimum ? AppTextTheme.semiBold : null,
                                  ),
                                ),
                              ),
                              // Only ever beside the limit itself: the lines,
                              // the subtotal and the submit button carry on
                              // with the figures already on screen while the
                              // re-read is in the air.
                              //
                              // The spinner is the only thing saying the limit
                              // beside it may be about to move, so it carries
                              // that in words too - to a screen reader it is
                              // otherwise an unlabelled, unexplained control.
                              if (state.isRefreshingLimits) ...[
                                const SizedBox(width: AppSizes.spacingXSmall),
                                SizedBox(
                                  width: AppSizes.iconSizeSmall,
                                  height: AppSizes.iconSizeSmall,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 1.5,
                                    color: AppColors.textSecondaryOf(context),
                                    semanticsLabel: l10n.loadingOrderLimits,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        if (state.maxOrderAmountUsd != null)
                          Text(
                            l10n.maxOrderLabel(limitText(state.maxOrderAmountUsd!)),
                            style: context.textTheme.bodySmall?.copyWith(
                              color: state.isAboveMaximum
                                  ? AppColors.errorOf(context)
                                  : AppColors.textSecondaryOf(context),
                              fontWeight: state.isAboveMaximum ? AppTextTheme.semiBold : null,
                            ),
                          ),
                      ],
                      if (state.isBelowMinimum || state.isAboveMaximum) ...[
                        const SizedBox(height: AppSizes.spacingXSmall),
                        Text(
                          state.isBelowMinimum
                              ? l10n.addMoreToReachMinimum(limitText(state.amountToReachMinimum))
                              : l10n.removeToMeetMaximum(limitText(state.maxOrderAmountUsd!)),
                          style: context.textTheme.bodyMedium?.copyWith(
                            color: state.isBelowMinimum
                                ? AppColors.primaryOf(context)
                                : AppColors.errorOf(context),
                            fontWeight: AppTextTheme.semiBold,
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSizes.spacingMedium),
                      if (state.hasOtherCarts) ...[
                        // Carts at several warehouses: one tap sends each as
                        // its own order. Each cart is quoted and checked
                        // against its own limits as it goes (CartCubit.submitAll).
                        PrimaryButton(
                          label: l10n.submitAllButton(state.cartCount),
                          isLoading: state.isSubmittingAll,
                          onPressed: state.isSubmitting || state.isSubmittingAll || state.isQuoting
                              ? null
                              : _confirmSubmitAll,
                        ),
                        TextButton(
                          onPressed: state.isReadyToSubmit && !state.isSubmittingAll ? _confirmSubmit : null,
                          child: Text(l10n.submitThisWarehouseOnly),
                        ),
                      ] else
                        PrimaryButton(
                          label: l10n.submitOrderButton,
                          isLoading: state.isSubmitting,
                          // Blocked locally so the pharmacist sees why before
                          // spending a round trip; order.service.js enforces
                          // the same rule regardless (double validation).
                          // ...and only once the server's figures for this
                          // exact cart are on screen (CartState.isReadyToSubmit).
                          onPressed: state.isReadyToSubmit ? _confirmSubmit : null,
                        ),
                    ],
                  ),
                  ),
                ),
              ),
              ),
            ],
          ),
          );
        },
        ),
      ),
    );
  }
}

// The cart summary: every figure is the server's quote (the cart quote
// endpoint), so the lines add up to exactly what the order will cost - the
// platform discount, and a discount code after it. While a re-quote is in the
// air the last figures stay, with a small indicator; with no current figures
// (the screen just opened, or a quote failed) the subtotal is the cart's own
// sum, the rest read as a dash, and a failed quote offers a retry - the submit
// button waits for real figures.
class _QuoteSummary extends StatelessWidget {
  const _QuoteSummary({required this.state});

  final CartState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final usdToSyp = context.watch<ExchangeRateCubit>().state.usdToSyp;
    // Stale figures stay up only while their replacement is on its way.
    final quote = state.quote != null && (!state.isQuoteStale || state.isQuoting) ? state.quote : null;
    final muted = context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context));
    final positive = context.textTheme.bodyMedium?.copyWith(
      color: AppColors.secondaryOf(context),
      fontWeight: AppTextTheme.semiBold,
    );

    Widget row(String label, String amount, {TextStyle? style, Key? key}) => Padding(
      padding: const EdgeInsets.only(bottom: AppSizes.spacingXSmall),
      child: Row(
        children: [
          Expanded(child: FullText(label, style: style ?? muted)),
          Text(amount, key: key, style: style ?? muted),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        row(
          l10n.subtotalLabel,
          quote != null
              ? formatSyp(quote.subtotalSyp, l10n.currencySuffix)
              : formatMoneySyp(state.subtotalSypAt(usdToSyp), l10n.currencySuffix),
          key: const Key('cartSubtotal'),
        ),
        if (quote != null && quote.platformDiscountSyp > 0)
          row(
            l10n.discountLabel,
            '- ${formatSyp(quote.platformDiscountSyp, l10n.currencySuffix)}',
            key: const Key('cartPlatformDiscount'),
          ),
        if (quote != null && quote.loyaltyDiscountSyp > 0)
          row(
            l10n.loyaltyDiscountLine,
            '- ${formatSyp(quote.loyaltyDiscountSyp, l10n.currencySuffix)}',
            style: positive,
            key: const Key('cartLoyaltyDiscount'),
          ),
        if (quote != null && quote.creditUsedSyp > 0)
          row(
            l10n.creditUsedLine,
            '- ${formatSyp(quote.creditUsedSyp, l10n.currencySuffix)}',
            style: positive,
            key: const Key('cartCreditUsed'),
          ),
        if (state.hasDiscountCode)
          row(
            l10n.discountCodeLine(state.discountCode!),
            quote != null && quote.hasCode ? '- ${formatSyp(quote.discountSyp, l10n.currencySuffix)}' : kMoneyUnavailable,
            style: positive,
            key: const Key('discountCodeAmount'),
          ),
        const SizedBox(height: AppSizes.spacingXSmall),
        Row(
          children: [
            Expanded(
              child: FullText(
                l10n.invoiceTotalLabel,
                style: context.textTheme.titleMedium),
            ),
            if (state.isQuoting) ...[
              SizedBox(
                width: AppSizes.iconSizeSmall,
                height: AppSizes.iconSizeSmall,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: AppColors.textSecondaryOf(context),
                  semanticsLabel: l10n.discountCodeUpdating,
                ),
              ),
              const SizedBox(width: AppSizes.spacingSmall),
            ],
            Text(
              quote != null ? formatSyp(quote.finalSyp, l10n.currencySuffix) : kMoneyUnavailable,
              key: const Key('cartTotal'),
              textAlign: TextAlign.end,
              style: context.textTheme.titleLarge?.copyWith(color: AppColors.primaryOf(context)),
            ),
          ],
        ),
        if (state.quoteErrorCode != null && !state.isQuoting)
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.cartQuoteUnavailable,
                  key: const Key('cartQuoteUnavailable'),
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.errorOf(context)),
                ),
              ),
              TextButton(
                key: const Key('cartQuoteRetry'),
                onPressed: context.read<CartCubit>().refreshQuote,
                child: Text(l10n.retryButton),
              ),
            ],
          ),
      ],
    );
  }
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart({required this.onBrowse});

  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Center(
      child: Padding(
        padding: AppPadding.screen,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(color: AppColors.surfaceOf(context), borderRadius: AppRadius.large),
              child: Icon(
                Icons.remove_shopping_cart_outlined,
                size: 40,
                color: AppColors.textSecondaryOf(context),
              ),
            ),
            const SizedBox(height: AppSizes.spacingMedium),
            Text(l10n.cartEmptyMessage, style: context.textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: AppSizes.spacingXSmall),
            Text(
              l10n.cartEmptyHint,
              textAlign: TextAlign.center,
              style: context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context)),
            ),
            const SizedBox(height: AppSizes.spacingLarge),
            FilledButton(
              onPressed: onBrowse,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryOf(context),
                foregroundColor: Colors.white,
                shape: const RoundedRectangleBorder(borderRadius: AppRadius.medium),
                padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingLarge, vertical: 14),
              ),
              child: Text(l10n.browseCatalogButton),
            ),
          ],
        ),
      ),
    );
  }
}

// The carts at the other warehouses, above the lines of the one in front: a
// chip per warehouse with its line count. Tapping one brings that cart to the
// front - the lines, code, notes and summary below are then that warehouse's.
class _WarehouseCartsStrip extends StatelessWidget {
  const _WarehouseCartsStrip({required this.state});

  final CartState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final carts = [state, ...state.otherCarts.values];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.cartOtherWarehousesHint,
          style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
        ),
        const SizedBox(height: AppSizes.spacingSmall),
        Wrap(
          spacing: AppSizes.spacingSmall,
          runSpacing: AppSizes.spacingSmall,
          children: [
            for (final cart in carts)
              ChoiceChip(
                selected: cart.warehouseId == state.warehouseId,
                label: Text('${cart.warehouseName ?? ''} · ${cart.itemCount}'),
                avatar: cart.errorCode != null && cart.warehouseId != state.warehouseId
                    ? Icon(Icons.error_outline, size: 18, color: AppColors.errorOf(context))
                    : null,
                onSelected: state.isSubmittingAll || cart.warehouseId == null
                    ? null
                    : (_) => context.read<CartCubit>().switchToWarehouse(cart.warehouseId!),
              ),
          ],
        ),
      ],
    );
  }
}
