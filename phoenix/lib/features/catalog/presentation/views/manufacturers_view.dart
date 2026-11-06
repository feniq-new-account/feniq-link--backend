import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_skeleton.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/cart/presentation/widgets/cart_button.dart';
import 'package:feniq/core/widgets/whatsapp_button.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/features/catalog/data/models/catalog_route_args.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/catalog/presentation/managers/catalog_cubit.dart';
import 'package:feniq/features/catalog/presentation/widgets/catalog_product_list.dart';
import 'package:feniq/features/catalog/presentation/widgets/catalog_search_bar.dart';
import 'package:feniq/features/catalog/presentation/managers/manufacturers_cubit.dart';
import 'package:feniq/features/catalog/presentation/managers/manufacturers_state.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_card.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/core/widgets/brand_header_glow.dart';
import 'package:feniq/core/widgets/full_text.dart';

// New step between warehouse selection and the catalog (Section 16):
// warehouse -> manufacturers -> medicines, replacing the old warehouse ->
// medicines flow directly.
class ManufacturersView extends StatefulWidget {
  const ManufacturersView({
    super.key,
    required this.warehouseId,
    required this.warehouseName,
    this.warehousePhone,
    this.autoFilterManufacturer,
  });

  final String warehouseId;
  final String warehouseName;
  final String? warehousePhone;
  // Section: banners - a tapped banner with a linked product skips this
  // screen straight through to its catalog, once the manufacturer list has
  // actually loaded (need it to confirm the manufacturer still has products
  // here before jumping). Never re-triggers on rebuild - see _autoNavigated.
  final String? autoFilterManufacturer;

  @override
  State<ManufacturersView> createState() => _ManufacturersViewState();
}

class _ManufacturersViewState extends State<ManufacturersView> {
  bool _autoNavigated = false;
  String? _warehousePhone;

  @override
  void initState() {
    super.initState();
    _warehousePhone = widget.warehousePhone;
    if (_warehousePhone?.trim().isNotEmpty == true) return;
    // Banner/deep-link navigation does not always carry the warehouse phone.
    // Load only the public, pharmacist-visible warehouse profile as fallback.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      try {
        final repository = context.read<WarehouseRepository>();
        final profile = await repository.getWarehouseProfile(widget.warehouseId);
        if (mounted) setState(() => _warehousePhone = profile.phone);
      } catch (_) {
        // The profile icon remains available if offline or access is denied.
      }
    });
  }

  // The warehouse-wide search above the manufacturers list: typing shows the
  // matching products from every manufacturer of this warehouse (a CatalogCubit
  // with no manufacturer filter); clearing it brings the manufacturers back.
  // Never searches across warehouses.
  final _searchController = TextEditingController();
  // Created on the first keystroke, so opening and leaving the screen without
  // searching costs nothing (and dispose never has to build one).
  CatalogCubit? _searchCubit;

  bool get _isSearching => _searchController.text.trim().isNotEmpty;

  void _onSearchChanged(String value) {
    final cubit = _searchCubit ??= CatalogCubit(
      catalogRepository: context.read<CatalogRepository>(),
      warehouseId: widget.warehouseId,
    );
    cubit.search(value);
    setState(() {});
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchCubit?.close();
    super.dispose();
  }

  void _handleSelect(BuildContext context, String manufacturer) {
    final shown = context
        .read<ManufacturersCubit>()
        .state
        .manufacturers
        .where((m) => m.name == manufacturer)
        .map((m) => m.displayName)
        .firstOrNull;
    context.pushNamed(
      RouteNames.catalog,
      pathParameters: {'warehouseId': widget.warehouseId},
      extra: CatalogRouteArgs(
        warehouseName: widget.warehouseName,
        manufacturer: manufacturer,
        manufacturerTitle: shown,
      ),
    );
  }

  void _maybeAutoNavigate(ManufacturersState state) {
    if (_autoNavigated || widget.autoFilterManufacturer == null) return;
    if (state.status != ManufacturersStatus.loaded) return;
    if (!state.manufacturers.any((m) => m.name == widget.autoFilterManufacturer)) return;

    _autoNavigated = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _handleSelect(context, widget.autoFilterManufacturer!);
    });
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
        title: BlocBuilder<ManufacturersCubit, ManufacturersState>(
          buildWhen: (previous, current) => previous.manufacturers.length != current.manufacturers.length,
          builder: (context, state) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FullText(widget.warehouseName, minScale: 0.6),
                FullText(
                  l10n.manufacturersCountSubtitle(state.manufacturers.length),
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.normal, color: Colors.white70), minScale: 0.6),
              ],
            );
          },
        ),
        actions: [
          IconButton(
            tooltip: l10n.warehouseProfileButtonLabel,
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.pushNamed(
              RouteNames.warehouseProfile,
              pathParameters: {'warehouseId': widget.warehouseId},
              extra: widget.warehouseName,
            ),
          ),
          if (_warehousePhone?.trim().isNotEmpty == true)
            Center(
              child: Padding(
                padding: const EdgeInsetsDirectional.only(end: 4),
                child: WhatsAppButton(
                  key: const ValueKey('warehouseHeaderWhatsApp'),
                  phone: _warehousePhone!,
                  size: 38,
                ),
              ),
            ),
          const CartButton(),
        ],
        bottom: CatalogSearchBar(
          controller: _searchController,
          hintText: l10n.searchWarehouseProductsHint,
          onChanged: _onSearchChanged,
        ),
      ),
      // _isSearching implies a keystroke happened, so the cubit exists.
      body: _isSearching && _searchCubit != null
          ? BlocProvider<CatalogCubit>.value(
              value: _searchCubit!,
              child: CatalogProductList(warehouseId: widget.warehouseId, warehouseName: widget.warehouseName),
            )
          : _buildManufacturers(context),
    );
  }

  Widget _buildManufacturers(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<ManufacturersCubit, ManufacturersState>(
      builder: (context, state) {
        _maybeAutoNavigate(state);
        switch (state.status) {
          case ManufacturersStatus.initial:
          case ManufacturersStatus.loading:
            // Same grid metrics as the loaded state below, so the cells
            // land exactly where the manufacturer cards will.
            return SkeletonGrid(
              maxCrossAxisExtent: 160,
              mainAxisExtent: 198,
              itemBuilder: (context, index) => const _ManufacturerSkeletonCell(),
            );
          case ManufacturersStatus.error:
            return FailureWidget(
              message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? l10n.errorState),
              onRetry: () => context.read<ManufacturersCubit>().loadManufacturers(),
            );
          case ManufacturersStatus.loaded:
            if (state.manufacturers.isEmpty) {
              return EmptyView(message: l10n.noManufacturersFound, icon: Icons.factory_outlined);
            }
            // No pull-to-refresh: the companies come with the warehouse's
            // catalog, which refreshes once a day (DailyRefresh).
            return GridView.builder(
                padding: AppPadding.screen,
                // Fluid column count (as many as fit at up to ~160px each)
                // rather than a fixed 1-vs-2 breakpoint - see
                // WarehouseSelectionView for the same treatment.
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 160,
                  mainAxisSpacing: AppSizes.spacingMedium,
                  crossAxisSpacing: AppSizes.spacingMedium,
                  // Was 180 - grew to fit the company-discount line the card
                  // now carries under the name.
                  mainAxisExtent: 198,
                ),
                itemCount: state.manufacturers.length,
                itemBuilder: (context, index) {
                  final manufacturer = state.manufacturers[index];
                  return ManufacturerCard(
                    manufacturer: manufacturer,
                    onSelect: () => _handleSelect(context, manufacturer.name),
                  );
                },
            );
        }
      },
    );
  }
}

// One manufacturer placeholder: the logo plate, the (two-line) name, and the
// company-discount line under it.
class _ManufacturerSkeletonCell extends StatelessWidget {
  const _ManufacturerSkeletonCell();

  @override
  Widget build(BuildContext context) {
    return const SkeletonCard(
      mainAxisSize: MainAxisSize.max,
      children: [
        SkeletonBar(height: 80, radius: AppRadius.medium),
        SizedBox(height: AppSizes.spacingSmall),
        SkeletonBar(height: 12),
        SizedBox(height: AppSizes.spacingXSmall),
        SkeletonBar(width: 78, height: 12),
      ],
    );
  }
}
