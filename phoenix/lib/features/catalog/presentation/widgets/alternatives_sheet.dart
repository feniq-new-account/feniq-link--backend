import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/catalog/presentation/widgets/product_card.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/core/widgets/full_text.dart';

// The alternatives to one medicine: what else this warehouse has with the same
// active ingredient, strength and form, available ones first then cheapest.
// Added to the cart exactly like a medicine in the catalog ([onAdd] is the
// catalog list's own handler, including the other-warehouse confirmation).
//
// A bottom sheet is its own route, so the providers the cards read are handed
// across explicitly rather than assumed to be above it.
Future<void> showAlternativesSheet(
  BuildContext context, {
  required String warehouseId,
  required ProductModel product,
  required void Function(ProductModel product, int quantity) onAdd,
}) {
  final repository = context.read<CatalogRepository>();
  final cartCubit = context.read<CartCubit>();
  final exchangeRateCubit = context.read<ExchangeRateCubit>();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) => MultiBlocProvider(
      providers: [
        BlocProvider.value(value: cartCubit),
        BlocProvider.value(value: exchangeRateCubit),
      ],
      child: _AlternativesSheet(
        repository: repository,
        warehouseId: warehouseId,
        product: product,
        onAdd: onAdd,
      ),
    ),
  );
}

class _AlternativesSheet extends StatefulWidget {
  const _AlternativesSheet({
    required this.repository,
    required this.warehouseId,
    required this.product,
    required this.onAdd,
  });

  final CatalogRepository repository;
  final String warehouseId;
  final ProductModel product;
  final void Function(ProductModel product, int quantity) onAdd;

  @override
  State<_AlternativesSheet> createState() => _AlternativesSheetState();
}

class _AlternativesSheetState extends State<_AlternativesSheet> {
  late Future<List<ProductModel>> _alternatives = _load();

  Future<List<ProductModel>> _load() =>
      widget.repository.getAlternatives(warehouseId: widget.warehouseId, productId: widget.product.id);

  void _retry() => setState(() => _alternatives = _load());

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cartState = context.watch<CartCubit>().state;
    int cartQuantityFor(String productId) => cartState.quantityAt(widget.warehouseId, productId);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: AppSizes.spacingMedium),
              decoration: BoxDecoration(color: Theme.of(context).dividerColor, borderRadius: AppRadius.full),
            ),
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: AppPadding.screen.left),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.alternativesTitle, style: context.textTheme.titleMedium),
                const SizedBox(height: 2),
                FullText(
                  widget.product.displayName,
                  style: context.textTheme.bodyMedium),
                Text(
                  l10n.alternativesSubtitle,
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                ),
                const SizedBox(height: AppSizes.spacingSmall),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<ProductModel>>(
              future: _alternatives,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  final error = snapshot.error;
                  final message = error is Failure ? translateErrorCode(l10n, error.code, error.errMessage) : l10n.errorState;
                  return FailureWidget(message: message, onRetry: _retry);
                }
                final products = snapshot.data ?? const <ProductModel>[];
                if (products.isEmpty) {
                  return EmptyView(message: l10n.alternativesEmpty, icon: Icons.medication_outlined);
                }
                return ListView.separated(
                  controller: scrollController,
                  padding: AppPadding.screen,
                  itemCount: products.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSizes.spacingSmall),
                  itemBuilder: (context, index) {
                    final product = products[index];
                    return ProductCard(
                      product: product,
                      isGrid: false,
                      cartQuantity: cartQuantityFor(product.id),
                      onAdd: (quantity) {
                        Navigator.of(context).pop();
                        widget.onAdd(product, quantity);
                      },
                      onCartQuantityChanged: (quantity) =>
                          context.read<CartCubit>().updateQuantityAt(widget.warehouseId, product.id, quantity),
                      onCartRemove: () => context.read<CartCubit>().removeItemAt(widget.warehouseId, product.id),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
