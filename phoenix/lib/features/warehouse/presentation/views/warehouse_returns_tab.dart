import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/returns/presentation/utils/return_labels.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_returns_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_paged_list.dart';
import 'package:feniq/routes/route_names.dart';

/// The pharmacies' return requests, opening on the ones waiting for an answer.
class WarehouseReturnsTab extends StatefulWidget {
  const WarehouseReturnsTab({super.key});

  @override
  State<WarehouseReturnsTab> createState() => _WarehouseReturnsTabState();
}

class _WarehouseReturnsTabState extends State<WarehouseReturnsTab> {
  final ScrollController _controller = ScrollController();

  @override
  void initState() {
    super.initState();
    listenForEnd(_controller, () => context.read<WarehouseReturnsCubit>().loadMore());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _open(WarehouseReturn item) async {
    final cubit = context.read<WarehouseReturnsCubit>();
    final updated = await context.pushNamed<WarehouseReturn>(
      RouteNames.warehouseReturn,
      pathParameters: {'returnId': item.id},
    );
    if (updated != null) cubit.applyReturn(updated);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      children: [
        BlocBuilder<WarehouseReturnsCubit, WarehouseReturnsState>(
          buildWhen: (a, b) => a.filter != b.filter,
          builder: (context, state) => WarehouseFilterChips<String?>(
            values: kWarehouseReturnFilters,
            selected: state.filter,
            label: (value) => value == null ? l10n.warehouseFilterAll : returnStatusLabel(l10n, value),
            onSelected: (value) => context.read<WarehouseReturnsCubit>().setFilter(value),
          ),
        ),
        Expanded(
          child: BlocBuilder<WarehouseReturnsCubit, WarehouseReturnsState>(
            builder: (context, state) => AppRefreshIndicator(
              onRefresh: () => context.read<WarehouseReturnsCubit>().load(),
              child: WarehousePagedList(
                controller: _controller,
                itemCount: state.returns.length,
                isLoading: state.status == RepLoadStatus.initial || state.status == RepLoadStatus.loading,
                isLoadingMore: state.isLoadingMore,
                errorMessage: state.status == RepLoadStatus.error
                    ? translateErrorCode(l10n, state.errorCode, state.errorMessage ?? '')
                    : null,
                onRetry: () => context.read<WarehouseReturnsCubit>().load(),
                emptyTitle: l10n.warehouseNoReturnsTitle,
                emptySubtitle: l10n.warehouseNoReturnsSubtitle,
                emptyIcon: Icons.assignment_return_outlined,
                itemBuilder: (context, index) {
                  final item = state.returns[index];
                  return _ReturnCard(item: item, onTap: () => _open(item));
                },
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ReturnCard extends StatelessWidget {
  const _ReturnCard({required this.item, required this.onTap});

  final WarehouseReturn item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final createdAt = item.createdAt;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    return CustomCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.orderNumber == null ? l10n.warehouseReturnNoOrder : l10n.warehouseReturnTitle(item.orderNumber!),
                  style: context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              StatusBadge(label: returnStatusLabel(l10n, item.status), tone: warehouseReturnTone(item.status)),
            ],
          ),
          const SizedBox(height: AppSizes.spacingSmall),
          Text(
            warehouseLocalName(context, item.pharmacyNameAr, item.pharmacyNameEn),
            style: context.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
          ),
          Text(
            [
              l10n.warehouseReturnUnits(item.unitCount),
              if (createdAt != null) DateFormatter.formatDateTime(createdAt),
            ].join(' · '),
            style: muted,
          ),
          if (item.creditSyp != null && item.status == 'approved')
            Text(l10n.warehouseReturnCredited(formatSyp(item.creditSyp!, l10n.currencySuffix)), style: muted),
        ],
      ),
    );
  }
}
