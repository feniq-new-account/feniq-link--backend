import 'package:feniq/core/services/android_startup_permissions.dart';
import 'package:feniq/features/launch/launch_status_banner.dart';
import 'package:feniq/features/launch/early_launch_notice.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_skeleton.dart';
import 'package:feniq/core/widgets/brand_logo.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/banners/data/models/banner_model.dart';
import 'package:feniq/features/banners/presentation/managers/banners_cubit.dart';
import 'package:feniq/features/banners/presentation/widgets/banner_slider.dart';
import 'package:feniq/features/cart/presentation/widgets/cart_button.dart';
import 'package:feniq/features/catalog/data/models/manufacturers_route_args.dart';
import 'package:feniq/features/catalog/data/repositories/catalog_repository.dart';
import 'package:feniq/features/exchange_rate/presentation/managers/exchange_rate_cubit.dart';
import 'package:feniq/features/notifications/presentation/widgets/notification_button.dart';
import 'package:feniq/features/warehouse_selection/data/models/warehouse_model.dart';
import 'package:feniq/features/warehouse_selection/data/repositories/warehouse_repository.dart';
import 'package:feniq/features/warehouse_selection/presentation/managers/warehouse_selection_cubit.dart';
import 'package:feniq/features/warehouse_selection/presentation/managers/warehouse_selection_state.dart';
import 'package:feniq/features/warehouse_selection/presentation/widgets/warehouse_card.dart';
import 'package:feniq/features/warehouse_selection/presentation/widgets/quick_search_sheet.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/core/widgets/brand_header_glow.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/core/widgets/sliver_row_grid.dart';
import 'package:feniq/core/widgets/offline_catalog_readiness.dart';

// Shared loaded/loading geometry; square cards can grow for full names.
const double _tileMaxWidth = 210;
const double _gridSpacing = AppSizes.spacingMedium - 4;

class WarehouseSelectionView extends StatefulWidget {
  const WarehouseSelectionView({super.key});

  @override
  State<WarehouseSelectionView> createState() => _WarehouseSelectionViewState();
}

class _WarehouseSelectionViewState extends State<WarehouseSelectionView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // The one guaranteed post-auth landing screen (splash / login / register
      // / approval-pending all navigate here). Tells the auth layer the shell
      // is up so a cold-start FCM notification deep link can be processed now
      // rather than racing the splash navigation (audit P7).
      context.read<AuthCubit>().notifyAppShellReady();
      // Native Android dialogs only; no custom permission UI.
      requestPharmacyStartupPermissions();
      context.read<WarehouseSelectionCubit>().loadWarehouses();
      // This screen is the one guaranteed landing point after every
      // successful auth path (splash/login/register/approval-pending all
      // navigate here) - fetching the session-wide exchange rate here once,
      // rather than in each of those views, satisfies "once per app
      // session, not per screen" (see exchange_rate_cubit.dart) without
      // duplicating the call site.
      context.read<ExchangeRateCubit>().load();
      // Fetched once here, same "screen open" trigger as everything else
      // above - no pull-to-refresh/polling for banners (see BannersCubit).
      context.read<BannersCubit>().load();
    });
  }

  void _openQuickSearch() {
    final warehouses = context.read<WarehouseSelectionCubit>().state.warehouses;
    final warehouseRepository = context.read<WarehouseRepository>();
    final catalogRepository = context.read<CatalogRepository>();
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceElevatedOf(context),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SizedBox(
        height: MediaQuery.sizeOf(sheetContext).height * 0.84,
        child: QuickSearchSheet(
          warehouseRepository: warehouseRepository,
          catalogRepository: catalogRepository,
          visibleWarehouses: warehouses,
        ),
      ),
    );
  }

  void _handleSelect(WarehouseModel warehouse) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final name = isArabic ? warehouse.nameAr : warehouse.nameEn;
    context.pushNamed(
      RouteNames.manufacturers,
      pathParameters: {'warehouseId': warehouse.id},
      extra: ManufacturersRouteArgs(warehouseName: name, warehousePhone: warehouse.phone),
    );
  }

  // Section: banners - a tapped banner with a linked product jumps straight
  // to that manufacturer's catalog, skipping the manual tap-through.
  void _handleBannerTap(BannerModel banner) {
    if (!banner.isTappable) return;
    context.pushNamed(
      RouteNames.manufacturers,
      pathParameters: {'warehouseId': banner.warehouseId!},
      extra: ManufacturersRouteArgs(
        warehouseName: '',
        warehousePhone: context.read<WarehouseSelectionCubit>().state.warehouses
            .where((warehouse) => warehouse.id == banner.warehouseId)
            .firstOrNull?.phone,
        autoFilterManufacturer: banner.manufacturerAr,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      floatingActionButtonLocation: Directionality.of(context) == TextDirection.rtl
          ? FloatingActionButtonLocation.endFloat
          : FloatingActionButtonLocation.startFloat,
      floatingActionButton: FloatingActionButton(
        key: const ValueKey('homeQuickSearchButton'),
        tooltip: Localizations.localeOf(context).languageCode == 'ar'
            ? 'بحث سريع عن دواء أو شركة أو مستودع'
            : 'Quick search for a medicine, manufacturer or warehouse',
        onPressed: _openQuickSearch,
        child: const Icon(Icons.search),
      ),
      // No pull-to-refresh: the warehouse list refreshes once a day by
      // itself (DailyRefresh).
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            snap: true,
            elevation: 0,
            backgroundColor: AppColors.navyOf(context),
            foregroundColor: Colors.white,
            toolbarHeight: 68,
            flexibleSpace: const BrandHeaderGlow(),
            leading: const Padding(
              padding: EdgeInsets.all(AppSizes.spacingSmall),
              child: BrandLogo.mark(height: 32, onDark: true),
            ),
            title: BlocBuilder<WarehouseSelectionCubit, WarehouseSelectionState>(
              buildWhen: (previous, current) => previous.warehouses.length != current.warehouses.length,
              builder: (context, state) {
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FullText(l10n.warehouseSelectionTitle, minScale: 0.6),
                    FullText(
                      l10n.warehousesAvailableSubtitle(state.warehouses.length),
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.normal, color: Colors.white70),
                      minScale: 0.6,
                    ),
                  ],
                );
              },
            ),
            actions: const [NotificationButton(), CartButton()],
          ),
          const SliverToBoxAdapter(child: EarlyLaunchNotice()),
          const SliverToBoxAdapter(child: LaunchStatusBanner(hideRoutinePrelaunchMessage: true)),
          SliverToBoxAdapter(child: BannerSlider(onBannerTap: _handleBannerTap)),
          // Keep only a compact synchronization timestamp above the
          // warehouse grid; city scope controls are not part of this release.
          BlocBuilder<WarehouseSelectionCubit, WarehouseSelectionState>(
            buildWhen: (previous, current) =>
                previous.warehouses != current.warehouses ||
                previous.status != current.status,
            builder: (context, state) => SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium),
                child: Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: OfflineCatalogReadiness(
                    warehouseIds: state.warehouses.map((w) => w.id).toList(),
                    onRetry: () => context.read<WarehouseSelectionCubit>().retryOfflineCatalogs(),
                  ),
                ),
              ),
            ),
          ),
          BlocBuilder<WarehouseSelectionCubit, WarehouseSelectionState>(
            builder: (context, state) {
              final largeText = MediaQuery.textScalerOf(context).scale(14) > 14 * 1.3;
              final screenWidth = MediaQuery.sizeOf(context).width;
              final tileMaxWidth = largeText && screenWidth < 600 ? screenWidth : _tileMaxWidth;
              switch (state.status) {
                case WarehouseListStatus.initial:
                case WarehouseListStatus.loading:
                  return SliverPadding(
                    padding: AppPadding.screen,
                    sliver: SliverRowGrid(
                      maxCrossAxisExtent: tileMaxWidth,
                      cellAspectRatio: largeText ? null : 1,
                      crossAxisSpacing: _gridSpacing,
                      mainAxisSpacing: _gridSpacing,
                      itemCount: 6,
                      itemBuilder: (context, index) => const _WarehouseSkeletonCell(),
                    ),
                  );
                case WarehouseListStatus.error:
                  return SliverFillRemaining(
                    hasScrollBody: false,
                    child: FailureWidget(
                      message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? l10n.errorState),
                      onRetry: () => context.read<WarehouseSelectionCubit>().loadWarehouses(),
                    ),
                  );
                case WarehouseListStatus.loaded:
                  if (state.warehouses.isEmpty) {
                    return SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyView(message: l10n.noWarehousesAvailable, icon: Icons.storefront_outlined),
                    );
                  }
                  return SliverPadding(
                    padding: AppPadding.screen,
                    sliver: SliverRowGrid(
                      maxCrossAxisExtent: tileMaxWidth,
                      cellAspectRatio: largeText ? null : 1,
                      mainAxisSpacing: _gridSpacing,
                      crossAxisSpacing: _gridSpacing,
                      itemCount: state.warehouses.length,
                      itemBuilder: (context, index) {
                        final warehouse = state.warehouses[index];
                        return WarehouseCard(
                          warehouse: warehouse,
                          onSelect: () => _handleSelect(warehouse),
                        );
                      },
                    ),
                  );
              }
            },
          ),
        ],
      ),
    );
  }
}

// Same compact logo and full-size action targets as the loaded card.
class _WarehouseSkeletonCell extends StatelessWidget {
  const _WarehouseSkeletonCell();

  @override
  Widget build(BuildContext context) {
    return const SkeletonCard(
      padding: EdgeInsets.all(10),
      mainAxisSize: MainAxisSize.max,
      children: [
        Spacer(),
        Center(child: SkeletonBar(width: 92, height: 92, radius: AppRadius.small)),
        SizedBox(height: 8),
        Center(child: SkeletonBar(width: 110, height: 18)),
        Spacer(),
      ],
    );
  }
}
