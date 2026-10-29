import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:uuid/uuid.dart';
import 'package:flutter/material.dart';
import 'package:feniq/features/warehouse/presentation/widgets/collect_payment_sheet.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/app_dialog.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/core/widgets/name_text.dart';
import 'package:feniq/core/widgets/quantity_stepper.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/core/utils/whatsapp_launcher.dart';
import 'package:feniq/features/cart/presentation/utils/order_status_label.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_order_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_order_detail_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';

/// One order on the warehouse's phone: who it is for, what to prepare, the
/// money, and the forward step. While it still awaits approval its quantities
/// can be corrected (or a line dropped) before it is sent.
class WarehouseOrderDetailView extends StatelessWidget {
  const WarehouseOrderDetailView({super.key});

  Future<void> _call(String phone) async {
    try {
      await launchUrl(Uri(scheme: 'tel', path: phone));
    } catch (_) {
      // No dialer on this device - nothing useful to show.
    }
  }

  // "Delivered" asks one thing instead of "are you sure": was it paid - all,
  // part, or later. Closing the sheet leaves the order on its way.
  Future<void> _deliverAndCollect(BuildContext context, WarehouseOrderDetail order) async {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseOrderDetailCubit>();
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
    } else if (!await cubit.advance()) {
      return;
    }
    messenger.showSnackBar(SnackBar(content: Text(message)));
  }

  void _confirmAdvance(BuildContext context, WarehouseOrderDetail order) {
    if (order.nextStatus == 'delivered' && context.read<AuthCubit?>()?.state.user?.warehouseRole != 'owner') {
      _deliverAndCollect(context, order);
      return;
    }
    final l10n = context.l10n;
    final cubit = context.read<WarehouseOrderDetailCubit>();
    final messenger = ScaffoldMessenger.of(context);
    Future<void> advance() async {
      final next = order.nextStatus;
      final ok = await cubit.advance();
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

  void _confirmSave(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseOrderDetailCubit>();
    if (cubit.state.draftRemovesEverything) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.warehouseCannotEmpty)));
      return;
    }
    if (!cubit.state.hasDraftChanges) {
      cubit.cancelEditing();
      return;
    }
    AppDialog.show(
      context: context,
      title: l10n.warehouseConfirmSaveTitle,
      content: l10n.warehouseConfirmSaveBody,
      actionLabel: l10n.warehouseSaveEdits,
      onAction: () => cubit.saveEdits(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocConsumer<WarehouseOrderDetailCubit, WarehouseOrderDetailState>(
      listenWhen: (a, b) => b.actionErrorCode != null && a.actionErrorCode != b.actionErrorCode,
      listener: (context, state) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(translateErrorCode(l10n, state.actionErrorCode, state.actionErrorMessage ?? ''))),
      ),
      builder: (context, state) {
        final order = state.order;
        return PopScope(
          // Answers the list with the order as it is now, so its row shows the
          // new status and total without a reload.
          canPop: false,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) GoRouter.of(context).pop(state.order);
          },
          child: Scaffold(
            appBar: AppBar(
              backgroundColor: AppColors.navyOf(context),
              foregroundColor: Colors.white,
              title: FullText(order == null ? '' : l10n.warehouseOrderTitle(order.orderNumber), minScale: 0.6),
            ),
            body: ResponsiveRoleBody(child: _body(context, state)),
            bottomNavigationBar: order == null ? null : _actions(context, state, order),
          ),
        );
      },
    );
  }

  Widget _body(BuildContext context, WarehouseOrderDetailState state) {
    final l10n = context.l10n;
    final order = state.order;
    if (order == null) {
      if (state.status == RepLoadStatus.error) {
        return ListView(
          padding: AppPadding.screen,
          children: [
            FailureWidget(
              message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
              onRetry: () => context.read<WarehouseOrderDetailCubit>().load(),
            ),
          ],
        );
      }
      return const Center(child: CircularProgressIndicator());
    }

    return AppRefreshIndicator(
      onRefresh: () => context.read<WarehouseOrderDetailCubit>().load(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: AppPadding.screen,
        children: [
          _statusCard(context, order),
          const SizedBox(height: AppSizes.spacingMedium),
          if (order.pharmacy != null) ...[
            _pharmacyCard(context, order.pharmacy!),
            const SizedBox(height: AppSizes.spacingMedium),
          ],
          _itemsCard(context, state, order),
          const SizedBox(height: AppSizes.spacingMedium),
          _moneyCard(context, order),
          if (order.notes != null) ...[
            const SizedBox(height: AppSizes.spacingMedium),
            _section(context, l10n.warehouseSectionNotes, [Text(order.notes!)]),
          ],
          if (order.statusHistory.isNotEmpty) ...[
            const SizedBox(height: AppSizes.spacingMedium),
            _historyCard(context, order),
          ],
        ],
      ),
    );
  }

  Widget _section(BuildContext context, String title, List<Widget> children) => CustomCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: context.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: AppSizes.spacingSmall),
        ...children,
      ],
    ),
  );

  Widget _statusCard(BuildContext context, WarehouseOrderDetail order) {
    final l10n = context.l10n;
    final createdAt = order.createdAt;
    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSizes.spacingSmall,
            runSpacing: AppSizes.spacingSmall,
            children: [
              StatusBadge(label: orderStatusLabel(l10n, order.status), tone: warehouseStatusTone(order.status)),
              if (order.hasReturn) ...[
                const SizedBox(width: AppSizes.spacingSmall),
                StatusBadge(label: l10n.warehouseHasReturn, tone: StatusBadgeTone.info),
              ],
              if (createdAt != null)
                Text(
                  DateFormatter.formatDateTime(createdAt, locale: context.l10n.localeName),
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                ),
            ],
          ),
          if (order.isWaitingForSealPhoto) ...[
            const SizedBox(height: AppSizes.spacingSmall),
            Text(l10n.warehouseWaitingSeal, style: context.textTheme.bodyMedium),
          ],
          if (order.status == 'cancelled' && order.cancelReason != null) ...[
            const SizedBox(height: AppSizes.spacingSmall),
            Text(l10n.warehouseCancelReason(order.cancelReason!), style: context.textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }

  Widget _pharmacyCard(BuildContext context, WarehouseOrderPharmacy pharmacy) {
    final l10n = context.l10n;
    final phone = pharmacy.phone;
    final place = [pharmacy.address, pharmacy.city].whereType<String>().join('، ');
    return _section(context, l10n.warehouseSectionPharmacy, [
      Text(warehousePharmacyName(context, pharmacy), style: context.textTheme.titleMedium),
      if (pharmacy.ownerName != null) Text(pharmacy.ownerName!, style: context.textTheme.bodyMedium),
      if (place.isNotEmpty)
        Text(place, style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context))),
      if (phone != null) ...[
        const SizedBox(height: AppSizes.spacingSmall),
        Wrap(
          spacing: AppSizes.spacingSmall,
          runSpacing: AppSizes.spacingSmall,
          children: [
            OutlinedButton.icon(
              onPressed: () => _call(phone),
              icon: const Icon(Icons.call_outlined, size: 18),
              label: Text(l10n.warehouseCall),
            ),
            const SizedBox(width: AppSizes.spacingSmall),
            OutlinedButton.icon(
              onPressed: () => launchWhatsApp(phone),
              icon: const Icon(Icons.chat_outlined, size: 18),
              label: const Text('WhatsApp'),
            ),
          ],
        ),
      ],
    ]);
  }

  Widget _itemsCard(BuildContext context, WarehouseOrderDetailState state, WarehouseOrderDetail order) {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseOrderDetailCubit>();
    return _section(context, l10n.warehouseSectionItems, [
      for (final item in order.items) ...[
        _itemRow(context, state, item, cubit),
        if (item != order.items.last) const Divider(height: AppSizes.spacingMedium),
      ],
      if (state.isEditing) ...[
        const SizedBox(height: AppSizes.spacingSmall),
        Text(
          l10n.warehouseEditHint,
          style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
        ),
      ],
    ]);
  }

  Widget _itemRow(
    BuildContext context,
    WarehouseOrderDetailState state,
    WarehouseOrderItem item,
    WarehouseOrderDetailCubit cubit,
  ) {
    final l10n = context.l10n;
    final removed = state.draftRemovals.contains(item.id);
    final quantity = state.quantityOf(item);
    final editable = state.isEditing && !item.isPackageLine;
    final manufacturer = englishFirstOrNull(item.manufacturerEn, item.manufacturerAr);
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));

    return Opacity(
      opacity: removed ? 0.45 : 1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          NameText(
            englishFirst(item.productNameEn, item.productNameAr),
            style: context.textTheme.bodyLarge?.copyWith(
              fontWeight: FontWeight.w600,
              decoration: removed ? TextDecoration.lineThrough : null,
            ),
          ),
          if (manufacturer != null) Text(manufacturer, style: muted),
          const SizedBox(height: 4),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              if (editable && !removed)
                QuantityStepper(quantity: quantity, onChanged: (value) => cubit.setQuantity(item, value))
              else
                Text('$quantity × ${formatSyp(item.discountPrice, l10n.currencySuffix)}', style: muted),
              if (item.freeQuantity > 0) ...[
                const SizedBox(width: AppSizes.spacingSmall),
                StatusBadge(label: l10n.warehouseFreeUnits(item.freeQuantity), tone: StatusBadgeTone.success),
              ],
              if (item.isPackageLine) ...[
                const SizedBox(width: AppSizes.spacingSmall),
                StatusBadge(label: l10n.warehousePackageLine, tone: StatusBadgeTone.info),
              ],
              if (editable)
                TextButton(
                  onPressed: () => cubit.toggleRemoved(item),
                  child: Text(removed ? l10n.warehouseRestoreLine : l10n.warehouseRemoveLine),
                )
              else
                Text(
                  formatSyp(item.discountPrice * quantity, l10n.currencySuffix),
                  style: context.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _moneyRow(BuildContext context, String label, double amount, {bool strong = false}) {
    final l10n = context.l10n;
    final style = strong
        ? context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: AppColors.primaryTextOf(context))
        : context.textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 12,
        runSpacing: 4,
        children: [
          Text(label, style: style),
          Text(formatSyp(amount, l10n.currencySuffix), style: style),
        ],
      ),
    );
  }

  Widget _moneyCard(BuildContext context, WarehouseOrderDetail order) {
    final l10n = context.l10n;
    final rep = order.repCommission;
    // Discounts other than the two named lines below (offers, packages, codes).
    final otherDiscounts = order.totalPrice - order.finalPrice - order.loyaltyDiscountAmount - order.creditUsedSyp;
    final anyDiscount = order.totalPrice > order.finalPrice;
    return _section(context, l10n.warehouseSectionMoney, [
      if (anyDiscount) _moneyRow(context, l10n.warehouseSubtotal, order.totalPrice),
      if (otherDiscounts > 0) _moneyRow(context, l10n.warehouseDiscounts, -otherDiscounts),
      if (order.loyaltyDiscountAmount > 0) _moneyRow(context, l10n.warehouseLoyaltyLine, -order.loyaltyDiscountAmount),
      if (order.creditUsedSyp > 0) _moneyRow(context, l10n.warehouseCreditUsedLine, -order.creditUsedSyp),
      _moneyRow(context, l10n.warehousePharmacyPays, order.finalPrice, strong: true),
      if (rep != null) ...[
        const Divider(height: AppSizes.spacingMedium),
        Text(
          l10n.warehouseRepCommissionTitle(warehouseRate(rep.rate)),
          style: context.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
        _moneyRow(context, l10n.warehouseRepShare, rep.repAmount),
        _moneyRow(context, l10n.warehouseRepPharmacyShare, rep.pharmacyAmount),
        _moneyRow(context, l10n.warehouseFeniqShare, rep.feniqAmount),
        if (rep.warehouseShareToRep)
          Text(
            l10n.warehouseRepShareGiven,
            style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
          )
        else
          _moneyRow(context, l10n.warehouseRepWarehouseShare, rep.savingAmount),
      ],
      if (order.commissionAmount > 0 || order.platformCompensationSyp > 0) ...[
        const Divider(height: AppSizes.spacingMedium),
        if (rep == null && order.commissionAmount > 0)
          _moneyRow(context, l10n.warehouseFeniqShare, order.commissionAmount),
        _moneyRow(context, l10n.warehouseYouKeep, order.warehouseNetSyp, strong: true),
      ],
    ]);
  }

  Widget _historyCard(BuildContext context, WarehouseOrderDetail order) {
    final l10n = context.l10n;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    return _section(context, l10n.warehouseSectionHistory, [
      for (final entry in order.statusHistory)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              Expanded(child: Text(orderHistoryLabel(l10n, entry.status))),
              if (entry.changedAt != null)
                Text(DateFormatter.formatDateTime(entry.changedAt!, locale: context.l10n.localeName), style: muted),
            ],
          ),
        ),
    ]);
  }

  Widget? _actions(BuildContext context, WarehouseOrderDetailState state, WarehouseOrderDetail order) {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseOrderDetailCubit>();
    final advanceLabel = warehouseAdvanceLabel(l10n, order.status);
    final busy = state.isActing;

    final List<Widget> buttons;
    if (state.isEditing) {
      buttons = [
        Expanded(
          child: OutlinedButton(onPressed: busy ? null : cubit.cancelEditing, child: Text(l10n.cancel)),
        ),
        const SizedBox(width: AppSizes.spacingSmall),
        Expanded(
          child: FilledButton(
            onPressed: busy ? null : () => _confirmSave(context),
            child: busy
                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(l10n.warehouseSaveEdits),
          ),
        ),
      ];
    } else {
      final canEdit = order.isEditable && order.items.any((i) => !i.isPackageLine);
      if (advanceLabel == null && !canEdit) return null;
      buttons = [
        if (canEdit)
          Expanded(
            child: OutlinedButton(onPressed: busy ? null : cubit.startEditing, child: Text(l10n.warehouseEditItems)),
          ),
        if (canEdit && advanceLabel != null) const SizedBox(width: AppSizes.spacingSmall),
        if (advanceLabel != null)
          Expanded(
            child: FilledButton(
              // Delivered waits for the pharmacy's seal photo when the order asks for one.
              onPressed: busy || order.isWaitingForSealPhoto ? null : () => _confirmAdvance(context, order),
              child: busy
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(advanceLabel),
            ),
          ),
      ];
    }
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingMedium),
        child: Row(children: buttons),
      ),
    );
  }
}
