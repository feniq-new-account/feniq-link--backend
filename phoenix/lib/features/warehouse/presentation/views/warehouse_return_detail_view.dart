import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/app_dialog.dart';
import 'package:feniq/core/widgets/app_network_image.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/core/widgets/name_text.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/returns/presentation/utils/return_labels.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_returns_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';

/// One return request: what came back and why, the photos, what approving
/// credits, and the two answers.
class WarehouseReturnDetailView extends StatelessWidget {
  const WarehouseReturnDetailView({super.key});

  void _confirmApprove(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseReturnDetailCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final preview = cubit.state.creditPreviewSyp;
    AppDialog.show(
      context: context,
      title: l10n.warehouseReturnApproveTitle,
      content: [
        if (preview != null) l10n.warehouseReturnCreditPreview(formatSyp(preview, l10n.currencySuffix)),
        l10n.warehouseReturnApproveBody,
      ].join('\n\n'),
      actionLabel: l10n.warehouseReturnApprove,
      onAction: () async {
        if (await cubit.approve()) {
          messenger.showSnackBar(
            SnackBar(content: Text(l10n.warehouseReturnResolved(returnStatusLabel(l10n, 'approved')))),
          );
        }
      },
    );
  }

  Future<void> _reject(BuildContext context) async {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseReturnDetailCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final note = await showDialog<String>(context: context, builder: (_) => const _RejectDialog());
    if (note == null || note.trim().isEmpty) return;
    if (await cubit.reject(note)) {
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.warehouseReturnResolved(returnStatusLabel(l10n, 'rejected')))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocConsumer<WarehouseReturnDetailCubit, WarehouseReturnDetailState>(
      listenWhen: (a, b) => b.actionErrorCode != null && a.actionErrorCode != b.actionErrorCode,
      listener: (context, state) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(translateErrorCode(l10n, state.actionErrorCode, state.actionErrorMessage ?? ''))),
      ),
      builder: (context, state) {
        final item = state.returnRequest;
        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) GoRouter.of(context).pop(state.returnRequest);
          },
          child: Scaffold(
            appBar: AppBar(
              backgroundColor: AppColors.navyOf(context),
              foregroundColor: Colors.white,
              title: FullText(
                item?.orderNumber == null ? l10n.warehouseReturnNoOrder : l10n.warehouseReturnTitle(item!.orderNumber!),
                minScale: 0.6,
              ),
            ),
            body: ResponsiveRoleBody(child: _body(context, state)),
            bottomNavigationBar: item == null || !item.isPending
                ? null
                : SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSizes.spacingMedium),
                      child: Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: state.isActing ? null : () => _reject(context),
                              child: Text(l10n.warehouseReturnReject),
                            ),
                          ),
                          const SizedBox(width: AppSizes.spacingSmall),
                          Expanded(
                            child: FilledButton(
                              onPressed: state.isActing ? null : () => _confirmApprove(context),
                              child: state.isActing
                                  ? const SizedBox.square(
                                      dimension: 18,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    )
                                  : Text(l10n.warehouseReturnApprove),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
          ),
        );
      },
    );
  }

  Widget _body(BuildContext context, WarehouseReturnDetailState state) {
    final l10n = context.l10n;
    final item = state.returnRequest;
    if (item == null) {
      if (state.status == RepLoadStatus.error) {
        return ListView(
          padding: AppPadding.screen,
          children: [
            FailureWidget(
              message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
              onRetry: () => context.read<WarehouseReturnDetailCubit>().load(),
            ),
          ],
        );
      }
      return const Center(child: CircularProgressIndicator());
    }
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    final createdAt = item.createdAt;
    final preview = state.creditPreviewSyp;

    Widget section(String title, List<Widget> children) => CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: context.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSizes.spacingSmall),
          ...children,
        ],
      ),
    );

    return ListView(
      padding: AppPadding.screen,
      children: [
        CustomCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  StatusBadge(label: returnStatusLabel(l10n, item.status), tone: warehouseReturnTone(item.status)),
                  const Spacer(),
                  if (createdAt != null)
                    Text(DateFormatter.formatDateTime(createdAt, locale: context.l10n.localeName), style: muted),
                ],
              ),
              const SizedBox(height: AppSizes.spacingSmall),
              Text(
                warehouseLocalName(context, item.pharmacyNameAr, item.pharmacyNameEn),
                style: context.textTheme.titleMedium,
              ),
              if (item.isPending && preview != null) ...[
                const SizedBox(height: AppSizes.spacingSmall),
                Text(
                  l10n.warehouseReturnCreditPreview(formatSyp(preview, l10n.currencySuffix)),
                  style: context.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
              if (item.status == 'approved' && item.creditSyp != null) ...[
                const SizedBox(height: AppSizes.spacingSmall),
                Text(l10n.warehouseReturnCredited(formatSyp(item.creditSyp!, l10n.currencySuffix))),
              ],
              if (item.status == 'rejected' && item.rejectionNote != null) ...[
                const SizedBox(height: AppSizes.spacingSmall),
                Text('${l10n.returnRejectionNoteLabel}: ${item.rejectionNote}'),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        section(l10n.warehouseSectionItems, [
          for (final line in item.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  NameText(
                    englishFirst(line.productNameEn, line.productNameAr ?? ''),
                    style: context.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  Text(
                    [
                      '${l10n.returnQuantityLabel}: ${line.quantity}',
                      '${l10n.returnReasonLabel}: ${returnReasonLabel(l10n, line.reasonType)}',
                    ].join(' · '),
                    style: muted,
                  ),
                  if (line.customReason != null) Text(line.customReason!, style: muted),
                ],
              ),
            ),
        ]),
        if (item.notes != null) ...[
          const SizedBox(height: AppSizes.spacingMedium),
          section(l10n.warehouseReturnPharmacyNotes, [Text(item.notes!)]),
        ],
        if (item.images.isNotEmpty) ...[
          const SizedBox(height: AppSizes.spacingMedium),
          section(l10n.warehouseReturnPhotos, [
            Wrap(
              spacing: AppSizes.spacingSmall,
              runSpacing: AppSizes.spacingSmall,
              children: [
                for (final url in item.images)
                  ClipRRect(
                    borderRadius: AppRadius.small,
                    child: SizedBox.square(
                      dimension: 96,
                      child: AppNetworkImage(url: url, fit: BoxFit.cover),
                    ),
                  ),
              ],
            ),
          ]),
        ],
      ],
    );
  }
}

class _RejectDialog extends StatefulWidget {
  const _RejectDialog();

  @override
  State<_RejectDialog> createState() => _RejectDialogState();
}

class _RejectDialogState extends State<_RejectDialog> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AlertDialog(
      title: Text(l10n.warehouseReturnRejectTitle),
      content: TextField(
        controller: _controller,
        autofocus: true,
        maxLines: 3,
        decoration: InputDecoration(hintText: l10n.warehouseReturnRejectHint),
        onChanged: (_) => setState(() {}),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.cancel)),
        TextButton(
          onPressed: _controller.text.trim().isEmpty ? null : () => Navigator.of(context).pop(_controller.text.trim()),
          child: Text(l10n.warehouseReturnReject),
        ),
      ],
    );
  }
}
