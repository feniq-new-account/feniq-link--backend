import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_skeleton.dart';
import 'package:feniq/core/widgets/app_snackbar.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/catalog/data/models/product_model.dart';
import 'package:feniq/features/catalog/presentation/managers/catalog_cubit.dart';
import 'package:feniq/features/catalog/presentation/managers/catalog_state.dart';
import 'package:feniq/features/catalog/presentation/widgets/alternatives_sheet.dart';
import 'package:feniq/features/catalog/presentation/widgets/product_card.dart';
import 'package:feniq/core/widgets/sliver_row_grid.dart';

// The product results of a CatalogCubit - loading skeleton, error, empty
// state, the grid/list of ProductCards with their cart actions, and "load
// more" on scroll. Shared by CatalogView (one manufacturer's medicines) and
// ManufacturersView's warehouse-wide search, so both render and add to the
// cart exactly the same way.
class CatalogProductList extends StatefulWidget {
  const CatalogProductList({super.key, required this.warehouseId, required this.warehouseName, this.isGrid = false});

  final String warehouseId;
  // Needed for cart operations (CartCubit.addProduct, the conflicting-
  // warehouse dialog).
  final String warehouseName;
  final bool isGrid;

  @override
  State<CatalogProductList> createState() => _CatalogProductListState();
}

class _CatalogProductListState extends State<CatalogProductList> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  // loadMore() already no-ops while a fetch is in flight or there's nothing
  // left to fetch, so firing this on every scroll tick past 80% is safe -
  // no extra guard needed here.
  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.maxScrollExtent > 0 && position.pixels >= position.maxScrollExtent * 0.8) {
      context.read<CatalogCubit>().loadMore();
    }
  }

  void _handleAdd(ProductModel product, int quantity) {
    final l10n = context.l10n;
    final name = product.displayName;
    final cartCubit = context.read<CartCubit>();

    // Section 6.6: a product from another warehouse goes to that warehouse's
    // own cart - the pharmacist can fill carts at several warehouses, and each
    // is sent as its own order.
    cartCubit.addProduct(
      product,
      warehouseId: widget.warehouseId,
      warehouseName: widget.warehouseName,
      quantity: quantity,
    );
    AppSnackbar.show(context, l10n.addedToCartMessage(name));
  }

  // Once a product is in the cart, its card shows a stepper wired straight to
  // CartCubit instead of the "Add" button - so a typed or stepped value goes
  // through updateQuantity and the number on the card is always
  // CartItem.quantity, never a copy. Taking it below 1 removes the line.
  // Scoped to this warehouse: the number is this warehouse's cart, and the
  // stepper edits that cart (bringing it to the front).
  void _setCartQuantity(ProductModel product, int quantity) {
    context.read<CartCubit>().updateQuantityAt(widget.warehouseId, product.id, quantity);
  }

  void _removeFromCart(ProductModel product) {
    context.read<CartCubit>().removeItemAt(widget.warehouseId, product.id);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isGrid = widget.isGrid;

    final cartState = context.watch<CartCubit>().state;
    int cartQuantityFor(String productId) => cartState.quantityAt(widget.warehouseId, productId);

    return BlocConsumer<CatalogCubit, CatalogState>(
      listenWhen: (previous, current) =>
          current.loadMoreErrorMessage != null && previous.loadMoreErrorMessage != current.loadMoreErrorMessage,
      listener: (context, state) {
        AppSnackbar.show(
          context,
          translateErrorCode(l10n, state.loadMoreErrorCode, state.loadMoreErrorMessage!),
          actionLabel: l10n.retryButton,
          onAction: () => context.read<CatalogCubit>().loadMore(),
        );
      },
      builder: (context, state) {
        if (state.status == CatalogStatus.initial) {
          return CatalogProductsSkeleton(isGrid: isGrid);
        }
        if (state.status == CatalogStatus.error && state.products.isEmpty) {
          return FailureWidget(
            message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? l10n.errorState),
            onRetry: () => context.read<CatalogCubit>().retry(),
          );
        }
        if (state.status == CatalogStatus.loading) {
          return CatalogProductsSkeleton(isGrid: isGrid);
        }
        if (state.products.isEmpty) {
          return EmptyView(message: l10n.noProductsFound, icon: Icons.inventory_2_outlined);
        }

        Widget cardFor(ProductModel product, {required bool grid}) {
          return ProductCard(
            product: product,
            isGrid: grid,
            cartQuantity: cartQuantityFor(product.id),
            onAdd: (quantity) => _handleAdd(product, quantity),
            onCartQuantityChanged: (quantity) => _setCartQuantity(product, quantity),
            onCartRemove: () => _removeFromCart(product),
            onShowAlternatives: () => showAlternativesSheet(
              context,
              warehouseId: widget.warehouseId,
              product: product,
              onAdd: _handleAdd,
            ),
          );
        }

        return CustomScrollView(
          controller: _scrollController,
          slivers: [
            SliverPadding(
              padding: AppPadding.screen,
              sliver: isGrid
                  ? SliverRowGrid(
                      // Fluid column count (one per 170px), rows as tall as
                      // their content: a long name wraps instead of being cut.
                      maxCrossAxisExtent: 170,
                      mainAxisSpacing: AppSizes.spacingMedium,
                      crossAxisSpacing: AppSizes.spacingMedium,
                      itemCount: state.products.length,
                      itemBuilder: (context, index) => cardFor(state.products[index], grid: true),
                    )
                  : SliverList(
                      delegate: SliverChildBuilderDelegate((context, index) {
                        final isLast = index == state.products.length - 1;
                        return Padding(
                          padding: EdgeInsets.only(bottom: isLast ? 0 : AppSizes.spacingSmall),
                          child: cardFor(state.products[index], grid: false),
                        );
                      }, childCount: state.products.length),
                    ),
            ),
            SliverToBoxAdapter(
              child: _PaginationFooter(state: state, isGrid: isGrid),
            ),
          ],
        );
      },
    );
  }
}

// The catalog's loading placeholder. A product is image-above-text in grid
// mode and thumbnail-beside-text in list mode, so neither shape reuses the
// standard SkeletonListCard - each mirrors the ProductCard it stands in for,
// down to the grid metrics of the real SliverGrid.
class CatalogProductsSkeleton extends StatelessWidget {
  const CatalogProductsSkeleton({super.key, required this.isGrid, this.itemCount});

  final bool isGrid;
  final int? itemCount;

  @override
  Widget build(BuildContext context) {
    if (isGrid) {
      return SkeletonGrid(
        itemCount: itemCount ?? 6,
        maxCrossAxisExtent: 170,
        mainAxisExtent: 344,
        itemBuilder: (context, index) => const _ProductGridCellSkeleton(),
      );
    }
    return SkeletonList(itemCount: itemCount ?? 6, itemBuilder: (context, index) => const _ProductRowSkeleton());
  }
}

class _ProductGridCellSkeleton extends StatelessWidget {
  const _ProductGridCellSkeleton();

  @override
  Widget build(BuildContext context) {
    return const SkeletonCard(
      padding: EdgeInsets.all(AppSizes.spacingSmall),
      mainAxisSize: MainAxisSize.max,
      children: [
        SkeletonBar(height: 132),
        SizedBox(height: AppSizes.spacingSmall),
        SkeletonBar(height: 12),
        SizedBox(height: AppSizes.spacingXSmall),
        SkeletonBar(width: 80, height: 10),
        SizedBox(height: AppSizes.spacingSmall),
        SkeletonBar(width: 96, height: 16),
        Spacer(),
        SkeletonBar(height: 36),
      ],
    );
  }
}

class _ProductRowSkeleton extends StatelessWidget {
  const _ProductRowSkeleton();

  @override
  Widget build(BuildContext context) {
    return const SkeletonCard(
      children: [
        Row(
          children: [
            SkeletonBar(width: 56, height: 56),
            SizedBox(width: AppSizes.spacingMedium),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  SkeletonBar(height: 12),
                  SizedBox(height: AppSizes.spacingXSmall),
                  SkeletonBar(width: 90, height: 10),
                  SizedBox(height: AppSizes.spacingSmall),
                  SkeletonBar(width: 70, height: 14),
                ],
              ),
            ),
            SizedBox(width: AppSizes.spacingSmall),
            SkeletonBar(width: 104, height: 40),
          ],
        ),
      ],
    );
  }
}

class _PaginationFooter extends StatelessWidget {
  const _PaginationFooter({required this.state, required this.isGrid});

  final CatalogState state;
  final bool isGrid;

  @override
  Widget build(BuildContext context) {
    if (state.isLoadingMore) {
      // The next page arrives into the shape it is about to fill - one more
      // row, or one more grid line - rather than under a spinner.
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSizes.spacingMedium),
        child: CatalogProductsSkeleton(isGrid: isGrid, itemCount: isGrid ? 2 : 1),
      );
    }
    if (!state.hasMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSizes.spacingMedium),
        child: Center(
          child: Text(
            context.l10n.noMoreResultsText,
            style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
          ),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}
