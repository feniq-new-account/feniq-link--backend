import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/utils/rep_labels.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_rep_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_paged_list.dart';

/// One rep: the pharmacies they cover (and when each was last visited), and
/// their visits, newest first, each with whether the location checked out.
class WarehouseRepDetailView extends StatefulWidget {
  const WarehouseRepDetailView({super.key, required this.repName});

  final String repName;

  @override
  State<WarehouseRepDetailView> createState() => _WarehouseRepDetailViewState();
}

class _WarehouseRepDetailViewState extends State<WarehouseRepDetailView> {
  final ScrollController _controller = ScrollController();

  @override
  void initState() {
    super.initState();
    listenForEnd(_controller, () => context.read<WarehouseRepDetailCubit>().loadMoreVisits());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: FullText(widget.repName, minScale: 0.6),
      ),
      body: ResponsiveRoleBody(
        child: BlocBuilder<WarehouseRepDetailCubit, WarehouseRepDetailState>(
          builder: (context, state) {
            if (state.status == RepLoadStatus.error && state.pharmacies.isEmpty && state.visits.isEmpty) {
              return ListView(
                padding: AppPadding.screen,
                children: [
                  FailureWidget(
                    message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                    onRetry: () => context.read<WarehouseRepDetailCubit>().load(),
                  ),
                ],
              );
            }
            if (state.status != RepLoadStatus.loaded && state.pharmacies.isEmpty && state.visits.isEmpty) {
              return const Center(child: CircularProgressIndicator());
            }
            final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
            Widget heading(String text) => Padding(
              padding: const EdgeInsets.only(top: AppSizes.spacingSmall),
              child: Text(text, style: context.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            );
            return AppRefreshIndicator(
              onRefresh: () => context.read<WarehouseRepDetailCubit>().load(),
              child: ListView(
                controller: _controller,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: AppPadding.screen,
                children: [
                  if (state.status == RepLoadStatus.loading) const LinearProgressIndicator(),
                  if (state.status == RepLoadStatus.error)
                    FailureWidget(
                      dense: true,
                      message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                      onRetry: () => state.loadMoreError
                          ? context.read<WarehouseRepDetailCubit>().loadMoreVisits()
                          : context.read<WarehouseRepDetailCubit>().load(),
                    ),
                  heading(l10n.warehouseRepPharmacies),
                  const SizedBox(height: AppSizes.spacingSmall),
                  if (state.pharmacies.isEmpty) Text(l10n.warehouseRepNoPharmacies, style: muted),
                  for (final pharmacy in state.pharmacies) ...[
                    CustomCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            warehouseLocalName(context, pharmacy.nameAr, pharmacy.nameEn),
                            style: context.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                          ),
                          Text(
                            [
                              if (pharmacy.city != null) pharmacy.city!,
                              pharmacy.lastVisitAt == null
                                  ? l10n.warehouseRepNeverVisited
                                  : l10n.warehouseRepLastVisit(
                                      DateFormatter.formatDate(pharmacy.lastVisitAt!, locale: context.l10n.localeName),
                                    ),
                            ].join(' · '),
                            style: muted,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSizes.spacingSmall),
                  ],
                  const SizedBox(height: AppSizes.spacingSmall),
                  heading(l10n.warehouseRepVisits),
                  const SizedBox(height: AppSizes.spacingSmall),
                  if (state.visits.isEmpty) Text(l10n.warehouseRepNoVisits, style: muted),
                  for (final visit in state.visits) ...[
                    CustomCard(
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  warehouseLocalName(context, visit.pharmacyNameAr, visit.pharmacyNameEn),
                                  style: context.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                                ),
                                if (visit.scannedAt != null)
                                  Text(
                                    DateFormatter.formatDateTime(visit.scannedAt!, locale: context.l10n.localeName),
                                    style: muted,
                                  ),
                              ],
                            ),
                          ),
                          StatusBadge(
                            label: visitStatusLabel(l10n, VisitStatus.parse(visit.status)),
                            tone: visitStatusTone(VisitStatus.parse(visit.status)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSizes.spacingSmall),
                  ],
                  if (state.isLoadingMore) const Center(child: CircularProgressIndicator()),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
