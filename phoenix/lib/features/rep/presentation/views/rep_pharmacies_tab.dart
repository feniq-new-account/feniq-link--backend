import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/debouncer.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/rep/presentation/managers/rep_home_cubit.dart';
import 'package:feniq/features/rep/presentation/utils/rep_labels.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacies_cubit.dart';
import 'package:feniq/features/rep/presentation/widgets/rep_pharmacy_card.dart';
import 'package:feniq/features/rep/presentation/widgets/rep_stat_tile.dart';
import 'package:feniq/routes/route_names.dart';

/// The rep's first tab: their numbers, a search box, and their pharmacies -
/// longest-unvisited first, so the list reads as "who do I go to next".
class RepPharmaciesTab extends StatefulWidget {
  const RepPharmaciesTab({super.key});

  @override
  State<RepPharmaciesTab> createState() => _RepPharmaciesTabState();
}

class _RepPharmaciesTabState extends State<RepPharmaciesTab> {
  final TextEditingController _search = TextEditingController();
  final Debouncer _debouncer = Debouncer();
  bool _needsVerifiedVisit = false;
  bool _missingLocation = false;

  @override
  void dispose() {
    _debouncer.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    await Future.wait([context.read<RepPharmaciesCubit>().load(), context.read<RepHomeCubit>().load()]);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return AppRefreshIndicator(
      onRefresh: _refresh,
      child: BlocBuilder<RepPharmaciesCubit, RepPharmaciesState>(
        builder: (context, state) {
          return ListView(
            // Always scrollable, so pull-to-refresh also works on a short or
            // empty list.
            physics: const AlwaysScrollableScrollPhysics(),
            padding: AppPadding.screen.add(EdgeInsets.only(bottom: roleFabClearance(context))),
            children: [
              const _StatsRow(),
              const SizedBox(height: AppSizes.spacingMedium),
              TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(hintText: l10n.repSearchHint, prefixIcon: const Icon(Icons.search)),
                onChanged: (text) => _debouncer.run(() => context.read<RepPharmaciesCubit>().load(search: text)),
              ),
              const SizedBox(height: AppSizes.spacingSmall),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  FilterChip(
                    label: Text(Localizations.localeOf(context).languageCode == 'ar'
                      ? 'تحتاج زيارة موثّقة' : 'Needs verified visit'),
                    selected: _needsVerifiedVisit,
                    onSelected: (value) => setState(() => _needsVerifiedVisit = value),
                  ),
                  FilterChip(
                    label: Text(Localizations.localeOf(context).languageCode == 'ar'
                      ? 'بلا موقع مسجّل' : 'Missing pharmacy location'),
                    selected: _missingLocation,
                    onSelected: (value) => setState(() => _missingLocation = value),
                  ),
                ],
              ),
              const SizedBox(height: AppSizes.spacingMedium),
              ..._body(context, state),
            ],
          );
        },
      ),
    );
  }

  List<Widget> _body(BuildContext context, RepPharmaciesState state) {
    final l10n = context.l10n;
    if (state.status == RepLoadStatus.error && state.pharmacies.isEmpty) {
      return [
        FailureWidget(
          message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
          onRetry: () => context.read<RepPharmaciesCubit>().load(),
        ),
      ];
    }
    if (state.pharmacies.isEmpty) {
      if (state.status == RepLoadStatus.initial || state.status == RepLoadStatus.loading) {
        return const [
          Padding(
            padding: EdgeInsets.all(AppSizes.spacingXLarge),
            child: Center(child: CircularProgressIndicator()),
          ),
        ];
      }
      final searching = state.query.isNotEmpty;
      return [
        Padding(
          padding: const EdgeInsets.only(top: AppSizes.spacingXLarge),
          child: EmptyView(
            message: searching ? l10n.repNoSearchResults : l10n.repNoPharmaciesTitle,
            subtitle: searching ? null : l10n.repNoPharmaciesSubtitle,
            icon: searching ? Icons.search_off : Icons.storefront_outlined,
          ),
        ),
      ];
    }
    final visible = repFollowupPharmacies(
      state.pharmacies, DateTime.now(),
      needsVerifiedVisit: _needsVerifiedVisit,
      missingLocation: _missingLocation,
    );
    return [
      if (visible.isEmpty)
        Padding(
          padding: const EdgeInsets.only(top: AppSizes.spacingMedium),
          child: Column(
            children: [
              Text(Localizations.localeOf(context).languageCode == 'ar'
                  ? 'ما في صيدليات مطابقة لفلاتر المتابعة.' : 'No pharmacies match these follow-up filters.'),
              TextButton(
                onPressed: () => setState(() {
                  _needsVerifiedVisit = false;
                  _missingLocation = false;
                }),
                child: Text(Localizations.localeOf(context).languageCode == 'ar'
                    ? 'إلغاء الفلاتر' : 'Clear filters'),
              ),
            ],
          ),
        ),
      if (state.status == RepLoadStatus.loading) const LinearProgressIndicator(),
      if (state.status == RepLoadStatus.error)
        FailureWidget(
          dense: true,
          message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
          onRetry: () => context.read<RepPharmaciesCubit>().load(),
        ),
      for (final pharmacy in visible) ...[
        RepPharmacyCard(
          pharmacy: pharmacy,
          onTap: () => context.pushNamed(RouteNames.repPharmacy, pathParameters: {'pharmacyId': pharmacy.id}),
        ),
        const SizedBox(height: AppSizes.spacingSmall),
      ],
    ];
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<RepHomeCubit, RepHomeState>(
      builder: (context, state) {
        final stats = state.me?.stats;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (state.status == RepLoadStatus.loading) const LinearProgressIndicator(),
            if (state.status == RepLoadStatus.error)
              FailureWidget(
                dense: true,
                message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                onRetry: () => context.read<RepHomeCubit>().load(),
              ),
            if (stats != null)
              ResponsiveStatsGrid(
                minTileWidth: 100,
                maxColumns: 3,
                children: [
                  RepStatTile(value: '${stats.pharmacyCount}', label: l10n.repStatPharmacies),
                  RepStatTile(value: '${stats.visitsLast7Days}', label: l10n.repStatVisitsWeek),
                  RepStatTile(value: '${stats.monthOrdersCount}', label: l10n.repStatOrdersMonth),
                ],
              ),
          ],
        );
      },
    );
  }
}
