import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/features/cart/presentation/widgets/cart_button.dart';
import 'package:feniq/features/catalog/presentation/managers/catalog_cubit.dart';
import 'package:feniq/features/catalog/presentation/managers/catalog_state.dart';
import 'package:feniq/features/catalog/presentation/widgets/catalog_product_list.dart';
import 'package:feniq/features/catalog/presentation/widgets/catalog_search_bar.dart';
import 'package:feniq/core/widgets/brand_header_glow.dart';
import 'package:feniq/core/widgets/full_text.dart';

class CatalogView extends StatefulWidget {
  const CatalogView({
    super.key,
    required this.warehouseId,
    required this.warehouseName,
    required this.manufacturer,
    this.manufacturerTitle,
    this.initialSearch,
  });

  final String warehouseId;
  // Still needed for cart operations (CartCubit.addProduct, the conflicting-
  // warehouse dialog) even though the AppBar now shows `manufacturer`
  // instead of this - see CatalogRouteArgs.
  final String warehouseName;
  final String manufacturer;
  // What the app bar calls the company - its English name when it has one.
  final String? manufacturerTitle;
  // The search box's starting text (the cubit was opened with the same query).
  final String? initialSearch;

  @override
  State<CatalogView> createState() => _CatalogViewState();
}

class _CatalogViewState extends State<CatalogView> {
  late final _searchController = TextEditingController(text: widget.initialSearch?.trim() ?? '');
  // Grid vs. list density - purely a local display preference (see
  // ProductCard's `isGrid`), never touches CatalogCubit/the fetched data.
  bool _isGrid = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        toolbarHeight: 64,
        flexibleSpace: const BrandHeaderGlow(),
        title: BlocBuilder<CatalogCubit, CatalogState>(
          buildWhen: (previous, current) => previous.products.length != current.products.length,
          builder: (context, state) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FullText(widget.manufacturerTitle ?? widget.manufacturer, minScale: 0.6),
                FullText(
                  l10n.catalogItemsCountSubtitle(state.products.length),
                  style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.normal, color: Colors.white70), minScale: 0.6),
              ],
            );
          },
        ),
        actions: [
          IconButton(
            tooltip: l10n.toggleDensityTooltip,
            onPressed: () => setState(() => _isGrid = !_isGrid),
            icon: Icon(_isGrid ? Icons.view_list_outlined : Icons.grid_view_outlined),
          ),
          const CartButton(),
        ],
        bottom: CatalogSearchBar(
          controller: _searchController,
          hintText: l10n.searchProductsHint,
          onChanged: (value) => context.read<CatalogCubit>().search(value),
        ),
      ),
      body: CatalogProductList(warehouseId: widget.warehouseId, warehouseName: widget.warehouseName, isGrid: _isGrid),
    );
  }
}
