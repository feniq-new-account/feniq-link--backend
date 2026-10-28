import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:feniq/core/utils/number_input.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/app_dialog.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/features/debts/presentation/widgets/statement_row_tile.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_accounts_tab.dart';

/// One pharmacy's account with the warehouse: the balance, the statement, and
/// recording money received. Reversing a payment stays on the panel.
class WarehouseStatementView extends StatefulWidget {
  const WarehouseStatementView({super.key});

  @override
  State<WarehouseStatementView> createState() => _WarehouseStatementViewState();
}

class _WarehouseStatementViewState extends State<WarehouseStatementView> {
  // A payment was recorded: the accounts list reloads on the way back.
  bool _changed = false;

  Future<void> _recordPayment(WarehouseStatement statement) async {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseStatementCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final name = warehouseLocalName(context, statement.pharmacyNameAr, statement.pharmacyNameEn);
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: _PaymentSheet(pharmacyName: name),
      ),
    );
    if (ok == true) {
      _changed = true;
      messenger.showSnackBar(SnackBar(content: Text(l10n.warehousePaymentRecorded)));
    } else {
      cubit.discardPendingPayment();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<WarehouseStatementCubit, WarehouseStatementState>(
      builder: (context, state) {
        final statement = state.statement;
        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) GoRouter.of(context).pop(_changed);
          },
          child: Scaffold(
            appBar: AppBar(
              backgroundColor: AppColors.navyOf(context),
              foregroundColor: Colors.white,
              title: FullText(
                statement == null
                    ? ''
                    : warehouseLocalName(context, statement.pharmacyNameAr, statement.pharmacyNameEn),
                minScale: 0.6,
              ),
              actions: [
                if (statement?.pharmacyPhone != null)
                  IconButton(
                    tooltip: l10n.warehouseCall,
                    icon: const Icon(Icons.call_outlined),
                    onPressed: () async {
                      try {
                        await launchUrl(Uri(scheme: 'tel', path: statement!.pharmacyPhone));
                      } catch (_) {}
                    },
                  ),
              ],
            ),
            floatingActionButton: statement == null
                ? null
                : FloatingActionButton.extended(
                    onPressed: () => _recordPayment(statement),
                    icon: const Icon(Icons.payments_outlined),
                    label: Text(l10n.warehouseRecordPayment),
                  ),
            body: ResponsiveRoleBody(child: _body(context, state)),
          ),
        );
      },
    );
  }

  Widget _body(BuildContext context, WarehouseStatementState state) {
    final l10n = context.l10n;
    final statement = state.statement;
    if (statement == null) {
      if (state.status == RepLoadStatus.error) {
        return ListView(
          padding: AppPadding.screen,
          children: [
            FailureWidget(
              message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
              onRetry: () => context.read<WarehouseStatementCubit>().load(),
            ),
          ],
        );
      }
      return const Center(child: CircularProgressIndicator());
    }
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    final rows = statement.rows.reversed.toList();
    return AppRefreshIndicator(
      onRefresh: () => context.read<WarehouseStatementCubit>().load(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        // Room under the last row for the floating button.
        padding: AppPadding.screen.copyWith(bottom: roleFabClearance(context)),
        children: [
          CustomCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                WarehouseBalanceText(balanceSyp: statement.closingSyp, large: true),
                const SizedBox(height: AppSizes.spacingSmall),
                Text(
                  [
                    '${l10n.statementCharges}: ${formatSyp(statement.summary.chargesSyp, l10n.currencySuffix)}',
                    '${l10n.statementPayments}: ${formatSyp(statement.summary.paymentsSyp, l10n.currencySuffix)}',
                    '${l10n.statementReturnCredits}: ${formatSyp(statement.summary.returnCreditsSyp, l10n.currencySuffix)}',
                  ].join('\n'),
                  style: muted,
                ),
                const SizedBox(height: AppSizes.spacingSmall),
                Text(l10n.warehousePaymentReverseHint, style: muted),
              ],
            ),
          ),
          const SizedBox(height: AppSizes.spacingMedium),
          CustomCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l10n.statementTitle, style: context.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: AppSizes.spacingSmall),
                if (rows.isEmpty) Text(l10n.statementEmpty, style: muted),
                for (final row in rows) ...[
                  StatementRowTile(row: row),
                  if (row != rows.last) const Divider(height: AppSizes.spacingMedium),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentSheet extends StatefulWidget {
  const _PaymentSheet({required this.pharmacyName});

  final String pharmacyName;

  @override
  State<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<_PaymentSheet> {
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _note = TextEditingController();
  String _method = 'cash';
  String? _amountError;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  double? get _parsedAmount {
    final text = _amount.text.replaceAll(RegExp(r'[,\s]'), '');
    final value = double.tryParse(text);
    return value == null || value <= 0 ? null : value;
  }

  void _submit() {
    final l10n = context.l10n;
    final amount = _parsedAmount;
    if (amount == null) {
      setState(() => _amountError = l10n.warehouseInvalidNumber);
      return;
    }
    final cubit = context.read<WarehouseStatementCubit>();
    final navigator = Navigator.of(context);
    // Money: one more look before it is posted to the account.
    AppDialog.show(
      context: context,
      title: l10n.warehouseRecordPayment,
      content: l10n.warehousePaymentConfirm(formatSyp(amount, l10n.currencySuffix), widget.pharmacyName),
      actionLabel: l10n.warehouseRecordPayment,
      onAction: () async {
        final ok = await cubit.recordPayment(amountSyp: amount, method: _method, note: _note.text);
        if (ok && navigator.mounted) navigator.pop(true);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: Padding(
          padding: AppPadding.screen,
          child: BlocBuilder<WarehouseStatementCubit, WarehouseStatementState>(
            builder: (context, state) => SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(l10n.warehouseRecordPaymentTitle, style: context.textTheme.titleMedium),
                  Text(widget.pharmacyName, style: context.textTheme.bodyMedium),
                  const SizedBox(height: AppSizes.spacingMedium),
                  TextField(
                    controller: _amount,
                    autofocus: true,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    textDirection: TextDirection.ltr,
                    inputFormatters: [
                      const WesternDigitsFormatter(),
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                    ],
                    decoration: InputDecoration(
                      labelText: l10n.warehousePaymentAmount(l10n.currencySuffix),
                      errorText: _amountError,
                    ),
                    onChanged: (_) {
                      if (_amountError != null) setState(() => _amountError = null);
                    },
                  ),
                  const SizedBox(height: AppSizes.spacingMedium),
                  Text(l10n.warehousePaymentMethod, style: context.textTheme.bodyMedium),
                  const SizedBox(height: AppSizes.spacingSmall),
                  Wrap(
                    spacing: AppSizes.spacingSmall,
                    children: [
                      for (final method in kPaymentMethods)
                        ChoiceChip(
                          label: Text(warehousePaymentMethodLabel(l10n, method)),
                          selected: _method == method,
                          onSelected: (_) => setState(() => _method = method),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSizes.spacingMedium),
                  TextField(
                    controller: _note,
                    decoration: InputDecoration(labelText: l10n.warehousePaymentNote),
                  ),
                  if (state.actionErrorCode != null) ...[
                    const SizedBox(height: AppSizes.spacingSmall),
                    Text(
                      translateErrorCode(l10n, state.actionErrorCode, state.actionErrorMessage ?? ''),
                      style: context.textTheme.bodySmall?.copyWith(color: AppColors.errorOf(context)),
                    ),
                  ],
                  const SizedBox(height: AppSizes.spacingMedium),
                  FilledButton(
                    onPressed: state.isSaving ? null : _submit,
                    child: state.isSaving
                        ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(l10n.warehouseRecordPayment),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
