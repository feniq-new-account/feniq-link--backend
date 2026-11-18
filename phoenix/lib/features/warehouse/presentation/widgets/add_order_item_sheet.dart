import 'dart:async';

import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/name_text.dart';
import 'package:feniq/core/widgets/quantity_stepper.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_order_detail_cubit.dart';

/// The manager adding a product to an order still awaiting approval - a
/// substitute for one that ran out, say. Searches the warehouse's own
/// available products, then asks how many. Returns the pick, or null when the
/// sheet was closed. Nothing is sent here: the pick joins the edit draft, and
/// the server reprices the order (offers included) when the edit is saved.
Future<DraftAddition?> showAddOrderItemSheet(
  BuildContext context, {
  required Future<List<WarehouseProductHit>> Function(String query) search,
  required bool Function(String productId) isOnOrder,
  double? usdToSyp,
}) {
  return showModalBottomSheet<DraftAddition>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => AddOrderItemSheet(
      search: search,
      isOnOrder: isOnOrder,
      usdToSyp: usdToSyp,
    ),
  );
}

class AddOrderItemSheet extends StatefulWidget {
  const AddOrderItemSheet({
    super.key,
    required this.search,
    required this.isOnOrder,
    this.usdToSyp,
    this.debounce = const Duration(milliseconds: 350),
  });

  final Future<List<WarehouseProductHit>> Function(String query) search;
  final bool Function(String productId) isOnOrder;
  final double? usdToSyp;
  final Duration debounce;

  @override
  State<AddOrderItemSheet> createState() => _AddOrderItemSheetState();
}

class _AddOrderItemSheetState extends State<AddOrderItemSheet> {
  final TextEditingController _query = TextEditingController();
  Timer? _timer;
  // Answers to an older query are dropped when a newer one was asked since.
  int _ticket = 0;
  bool _loading = true;
  String? _errorCode;
  String? _errorMessage;
  List<WarehouseProductHit> _results = const [];
  WarehouseProductHit? _picked;
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    _run('');
  }

  @override
  void dispose() {
    _timer?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _timer?.cancel();
    _timer = Timer(widget.debounce, () => _run(value));
  }

  Future<void> _run(String query) async {
    final ticket = ++_ticket;
    setState(() {
      _loading = true;
      _errorCode = null;
      _errorMessage = null;
    });
    try {
      final results = await widget.search(query);
      if (!mounted || ticket != _ticket) return;
      setState(() {
        _results = results;
        _loading = false;
      });
    } on Failure catch (f) {
      if (!mounted || ticket != _ticket) return;
      setState(() {
        _loading = false;
        _errorCode = f.code;
        _errorMessage = f.errMessage;
      });
    }
  }

  String _price(WarehouseProductHit product) => formatMoneyFromUsd(
    product.priceUsd,
    widget.usdToSyp,
    context.l10n.currencySuffix,
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: Padding(
          padding: AppPadding.screen,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.warehouseAddItemTitle, style: context.textTheme.titleMedium),
              const SizedBox(height: AppSizes.spacingSmall),
              if (_picked == null) ..._searchStep(context) else ..._quantityStep(context, _picked!),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _searchStep(BuildContext context) {
    final l10n = context.l10n;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    final Widget body;
    if (_loading) {
      body = const Padding(
        padding: EdgeInsets.all(AppSizes.spacingLarge),
        child: Center(child: CircularProgressIndicator()),
      );
    } else if (_errorCode != null || _errorMessage != null) {
      body = Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSizes.spacingMedium),
        child: Column(
          children: [
            Text(
              _errorCode != null
                  ? translateErrorCode(l10n, _errorCode, _errorMessage ?? '')
                  : l10n.warehouseAddItemFailed,
              textAlign: TextAlign.center,
            ),
            TextButton(onPressed: () => _run(_query.text), child: Text(l10n.retryButton)),
          ],
        ),
      );
    } else if (_results.isEmpty) {
      body = Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSizes.spacingLarge),
        child: Text(l10n.warehouseAddItemEmpty, textAlign: TextAlign.center, style: muted),
      );
    } else {
      body = Flexible(
        child: ListView.separated(
          shrinkWrap: true,
          itemCount: _results.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final product = _results[index];
            final onOrder = widget.isOnOrder(product.id);
            final manufacturer = englishFirstOrNull(product.manufacturerEn, product.manufacturerAr);
            return ListTile(
              contentPadding: EdgeInsets.zero,
              enabled: !onOrder,
              title: NameText(englishFirst(product.nameEn, product.nameAr)),
              subtitle: Text(
                onOrder ? l10n.warehouseAddItemOnOrder : (manufacturer ?? ''),
                style: muted,
              ),
              trailing: Text(_price(product), style: context.textTheme.bodyMedium),
              onTap: onOrder
                  ? null
                  : () => setState(() {
                      _picked = product;
                      _quantity = 1;
                    }),
            );
          },
        ),
      );
    }
    return [
      TextField(
        controller: _query,
        autofocus: true,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: l10n.warehouseAddItemSearchHint,
          prefixIcon: const Icon(Icons.search),
        ),
        onChanged: _onChanged,
        onSubmitted: (value) {
          _timer?.cancel();
          _run(value);
        },
      ),
      const SizedBox(height: AppSizes.spacingSmall),
      body,
    ];
  }

  List<Widget> _quantityStep(BuildContext context, WarehouseProductHit product) {
    final l10n = context.l10n;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    final manufacturer = englishFirstOrNull(product.manufacturerEn, product.manufacturerAr);
    return [
      NameText(
        englishFirst(product.nameEn, product.nameAr),
        style: context.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
      ),
      if (manufacturer != null) Text(manufacturer, style: muted),
      const SizedBox(height: 4),
      Text(_price(product), style: context.textTheme.bodyMedium),
      Text(l10n.warehouseAddItemPriceNote, style: muted),
      const SizedBox(height: AppSizes.spacingMedium),
      Center(
        child: QuantityStepper(
          quantity: _quantity,
          onChanged: (value) => setState(() => _quantity = value),
        ),
      ),
      const SizedBox(height: AppSizes.spacingMedium),
      Row(
        children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => setState(() => _picked = null),
              child: Text(l10n.warehouseAddItemBack),
            ),
          ),
          const SizedBox(width: AppSizes.spacingSmall),
          Expanded(
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(
                DraftAddition(product: product, quantity: _quantity),
              ),
              child: Text(l10n.warehouseAddItemConfirm),
            ),
          ),
        ],
      ),
    ];
  }
}
