import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/widgets/name_text.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
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
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/catalog/data/models/catalog_route_args.dart';
import 'package:feniq/features/catalog/data/models/elsewhere_alternative.dart';
import 'package:feniq/features/catalog/presentation/widgets/manufacturer_avatar.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:go_router/go_router.dart';

// The alternatives to one medicine: what else this warehouse has with the same
// active ingredient, strength and form, available ones first then cheapest -
// added to the cart exactly like a medicine in the catalog ([onAdd] is the
// catalog list's own handler, including the other-warehouse confirmation).
// Under them, the medicine itself and its alternatives at the other
// warehouses; tapping one goes to that warehouse's catalog, on the medicine.
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

// What the sheet shows: this warehouse's alternatives, and the medicine and
// its alternatives at the other warehouses - null when that second list could
// not be loaded (it is extra; this warehouse's list still shows).
class _Alternatives {
  const _Alternatives(this.here, this.elsewhere);

  final List<ProductModel> here;
  final List<ElsewhereAlternative>? elsewhere;
}

class _AlternativesSheetState extends State<_AlternativesSheet> {
  late Future<_Alternatives> _alternatives = _load();

  Future<_Alternatives> _load() async {
    final elsewhere = widget.repository
        .getAlternativesElsewhere(warehouseId: widget.warehouseId, productId: widget.product.id)
        .then<List<ElsewhereAlternative>?>((value) => value, onError: (Object _) => null);
    final here = await widget.repository.getAlternatives(warehouseId: widget.warehouseId, productId: widget.product.id);
    return _Alternatives(here, await elsewhere);
  }

  void _retry() => setState(() => _alternatives = _load());

  // Takes the pharmacist to the other warehouse's catalog, opened on this
  // medicine's company and already searched for it.
  void _goTo(ElsewhereAlternative entry) {
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    router.pushNamed(
      RouteNames.catalog,
      pathParameters: {'warehouseId': entry.warehouseId},
      extra: CatalogRouteArgs(
        warehouseName: entry.warehouseName,
        manufacturer: entry.product.manufacturerAr,
        manufacturerTitle: entry.product.displayManufacturer,
        initialSearch: entry.product.displayName,
      ),
    );
  }

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
      // No handle of its own (the theme's bottom sheet draws one), and clear
      // of the phone's navigation buttons at the bottom.
      builder: (context, scrollController) => SafeArea(
        top: false,
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
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
            child: FutureBuilder<_Alternatives>(
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
                final here = snapshot.data?.here ?? const <ProductModel>[];
                final elsewhere = snapshot.data?.elsewhere ?? const <ElsewhereAlternative>[];
                if (here.isEmpty && elsewhere.isEmpty) {
                  final searchedEverywhere = snapshot.data?.elsewhere != null;
                  return EmptyView(
                    message: searchedEverywhere ? l10n.alternativesNoneEverywhere : l10n.alternativesEmpty,
                    icon: Icons.medication_outlined,
                  );
                }

                final children = <Widget>[];
                // This warehouse first. With nothing here, one quiet line says
                // so above the other warehouses.
                if (elsewhere.isNotEmpty) children.add(_SectionTitle(title: l10n.alternativesHereTitle));
                if (here.isEmpty) {
                  children.add(
                    Text(
                      l10n.alternativesEmpty,
                      style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                    ),
                  );
                }
                for (final product in here) {
                  children.add(
                    ProductCard(
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
                    ),
                  );
                }
                if (elsewhere.isNotEmpty) {
                  children.add(const SizedBox(height: AppSizes.spacingSmall));
                  children.add(_SectionTitle(title: l10n.alternativesElsewhereTitle, hint: l10n.alternativesElsewhereHint));
                  for (final entry in elsewhere) {
                    children.add(_ElsewhereTile(entry: entry, onTap: () => _goTo(entry)));
                  }
                }

                return ListView.separated(
                  controller: scrollController,
                  padding: AppPadding.screen,
                  itemCount: children.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSizes.spacingSmall),
                  itemBuilder: (context, index) => children[index],
                );
              },
            ),
          ),
        ],
      ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.hint});

  final String title;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: context.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        if (hint != null)
          Text(hint!, style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context))),
      ],
    );
  }
}

// One medicine at another warehouse. The warehouse leads (it is where the tap
// goes), then the medicine - "same medicine" when it is the one asked about -
// its strength and form, and the price that warehouse charges.
class _ElsewhereTile extends StatelessWidget {
  const _ElsewhereTile({required this.entry, required this.onTap});

  final ElsewhereAlternative entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final product = entry.product;
    final usdToSyp = context.watch<ExchangeRateCubit>().state.usdToSyp;
    final details = [
      if ((product.strength ?? '').trim().isNotEmpty) ltrIsolate(product.strength!.trim()),
      if ((product.dosageForm ?? '').trim().isNotEmpty) product.dosageForm!.trim(),
    ].join('  •  ');

    return CustomCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.large,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  SizedBox.square(
                    dimension: 32,
                    child: ManufacturerAvatar(name: entry.warehouseName, logoUrl: entry.warehouseLogo),
                  ),
                  const SizedBox(width: AppSizes.spacingSmall),
                  Expanded(
                    child: NameText(
                      entry.warehouseName,
                      style: context.textTheme.bodyMedium?.copyWith(
                        color: AppColors.primaryOf(context),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (entry.isSameMedicine)
                    StatusBadge(label: l10n.alternativesSameMedicine, tone: StatusBadgeTone.info),
                ],
              ),
              const SizedBox(height: AppSizes.spacingSmall),
              NameText(
                product.displayName,
                style: context.textTheme.bodyMedium?.copyWith(fontSize: 13.5, fontWeight: FontWeight.w700),
              ),
              NameText(
                product.displayManufacturer,
                style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context), fontSize: 11),
              ),
              if (details.isNotEmpty)
                Text(
                  details,
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context), fontSize: 11),
                ),
              const SizedBox(height: AppSizes.spacingSmall),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      formatMoneySyp(product.finalSypAt(usdToSyp), l10n.currencySuffix),
                      style: TextStyle(
                        color: AppColors.primaryOf(context),
                        fontWeight: FontWeight.w700,
                        fontSize: 14.5,
                      ),
                    ),
                  ),
                  Flexible(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            l10n.alternativesGoToWarehouse,
                            style: context.textTheme.bodySmall?.copyWith(
                              color: AppColors.primaryOf(context),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 2),
                        Icon(
                          Directionality.of(context) == TextDirection.rtl
                              ? Icons.chevron_left_rounded
                              : Icons.chevron_right_rounded,
                          size: 18,
                          color: AppColors.primaryOf(context),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
