import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:uuid/uuid.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_dialog.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/widgets/collect_payment_sheet.dart';
import 'package:feniq/features/cart/presentation/utils/order_status_label.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_orders_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';
import 'package:feniq/features/warehouse/presentation/widgets/warehouse_order_card.dart';
import 'package:feniq/routes/route_names.dart';

/// The warehouse's orders: a status tab at a time, oldest first, with the
/// forward step one tap (and one confirmation) away on every row.
class WarehouseOrdersTab extends StatefulWidget {
  const WarehouseOrdersTab({super.key});

  @override
  State<WarehouseOrdersTab> createState() => _WarehouseOrdersTabState();
}

class _WarehouseOrdersTabState extends State<WarehouseOrdersTab> {
  final ScrollController _controller = ScrollController();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onScroll);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_controller.hasClients) return;
    final position = _controller.position;
    if (position.pixels >= position.maxScrollExtent - 240) {
      context.read<WarehouseOrdersCubit>().loadMore();
    }
  }

  // "Delivered" asks one thing instead of "are you sure": was it paid - all,
  // part, or later. Closing the sheet leaves the order on its way.
  Future<void> _deliverAndCollect(WarehouseOrderSummary order) async {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseOrdersCubit>();
    final payments = context.read<WarehouseManagementRepository>();
    final messenger = ScaffoldMessenger.of(context);
    final collected = await showCollectPaymentSheet(
      context,
      orderNumber: order.orderNumber,
      totalSyp: order.finalPrice,
    );
    if (collected == null) return;
    var message = l10n.warehouseOrderAdvanced(order.orderNumber, orderStatusLabel(l10n, 'delivered'));
    if (collected > 0) {
      final pharmacyId = order.pharmacy?.id;
      if (pharmacyId == null) return;
      try {
        // The journal is durable before delivery as well as before payment.
        await payments.recordPayment(
          pharmacyId: pharmacyId,
          amountSyp: collected,
          method: 'cash',
          idempotencyKey: const Uuid().v4(),
          deliveryOrderId: order.id,
          note: l10n.warehouseCollectNote(order.orderNumber),
        );
        message = l10n.warehouseCollectRecorded(formatSyp(collected, l10n.currencySuffix));
      } catch (_) {
        message = l10n.paymentUnconfirmed;
      }
      await cubit.load();
    } else if (!await cubit.advance(order.id)) {
      return;
    }
    messenger.showSnackBar(SnackBar(content: Text(message)));
  }

  void _confirmAdvance(WarehouseOrderSummary order) {
    if (nextWarehouseStatus(order.status) == 'delivered') {
      _deliverAndCollect(order);
      return;
    }
    final l10n = context.l10n;
    final cubit = context.read<WarehouseOrdersCubit>();
    final messenger = ScaffoldMessenger.of(context);
    Future<void> advance() async {
      final next = nextWarehouseStatus(order.status);
      final ok = await cubit.advance(order.id);
      if (ok && next != null) {
        messenger.showSnackBar(
          SnackBar(content: Text(l10n.warehouseOrderAdvanced(order.orderNumber, orderStatusLabel(l10n, next)))),
        );
      }
    }

    final confirm = warehouseAdvanceConfirm(l10n, order.status, order.orderNumber);
    if (confirm == null) {
      advance();
      return;
    }
    AppDialog.show(
      context: context,
      title: confirm.$1,
      content: confirm.$2,
      actionLabel: warehouseAdvanceLabel(l10n, order.status),
      onAction: advance,
    );
  }

  Future<void> _open(WarehouseOrderSummary order) async {
    final cubit = context.read<WarehouseOrdersCubit>();
    final detail = await context.pushNamed<WarehouseOrderDetail>(
      RouteNames.warehouseOrder,
      pathParameters: {'orderId': order.id},
    );
    // The detail screen answers with the order as it left it.
    if (detail != null) cubit.applyDetail(detail);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      children: [
        BlocBuilder<WarehouseOrdersCubit, WarehouseOrdersState>(
          buildWhen: (a, b) => a.filter != b.filter,
          builder: (context, state) => SizedBox(
            height: roleFilterHeight(context),
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: AppSizes.spacingSmall),
              children: [
                for (final filter in kWarehouseOrderFilters)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: AppSizes.spacingSmall),
                    child: ChoiceChip(
                      label: Text(warehouseFilterLabel(l10n, filter)),
                      selected: state.filter == filter,
                      onSelected: (_) => context.read<WarehouseOrdersCubit>().setFilter(filter),
                    ),
                  ),
              ],
            ),
          ),
        ),
        Expanded(
          child: BlocConsumer<WarehouseOrdersCubit, WarehouseOrdersState>(
            listenWhen: (a, b) => b.actionErrorCode != null && a.actionErrorCode != b.actionErrorCode,
            listener: (context, state) => ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(translateErrorCode(l10n, state.actionErrorCode, state.actionErrorMessage ?? ''))),
            ),
            builder: (context, state) => AppRefreshIndicator(
              onRefresh: () => context.read<WarehouseOrdersCubit>().load(),
              child: _buildList(context, state),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildList(BuildContext context, WarehouseOrdersState state) {
    final l10n = context.l10n;
    if (state.status == RepLoadStatus.error && state.orders.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: AppPadding.screen,
        children: [
          FailureWidget(
            message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
            onRetry: () => context.read<WarehouseOrdersCubit>().load(),
          ),
        ],
      );
    }
    if (state.orders.isEmpty) {
      final loading = state.status == RepLoadStatus.initial || state.status == RepLoadStatus.loading;
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: AppPadding.screen,
        children: [
          const SizedBox(height: AppSizes.spacingXLarge),
          if (loading)
            const Center(child: CircularProgressIndicator())
          else
            EmptyView(
              message: l10n.warehouseNoOrdersTitle,
              subtitle: l10n.warehouseNoOrdersSubtitle,
              icon: Icons.receipt_long_outlined,
            ),
        ],
      );
    }
    return ListView.separated(
      controller: _controller,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: AppPadding.screen,
      itemCount: state.orders.length + (state.isLoadingMore ? 1 : 0),
      separatorBuilder: (_, _) => const SizedBox(height: AppSizes.spacingSmall),
      itemBuilder: (context, index) {
        if (index >= state.orders.length) {
          return const Padding(
            padding: EdgeInsets.all(AppSizes.spacingMedium),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        final order = state.orders[index];
        return WarehouseOrderCard(
          order: order,
          isAdvancing: state.advancingIds.contains(order.id),
          onTap: () => _open(order),
          onAdvance: () => _confirmAdvance(order),
        );
      },
    );
  }
}
