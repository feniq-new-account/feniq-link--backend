import 'package:feniq/core/utils/number_input.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_loyalty_view.dart' show parseWholeLiras;

/// "Pay in full": a small confirm, then one cash payment for what the
/// pharmacy owes.
Future<void> payAccountInFull(BuildContext context, WarehouseAccountRow row) async {
  final l10n = context.l10n;
  final cubit = context.read<WarehouseAccountsCubit>();
  final messenger = ScaffoldMessenger.of(context);
  final amount = formatSyp(row.balanceSyp, l10n.currencySuffix);
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(l10n.warehouseAccountPayFull),
      content: Text(l10n.warehouseAccountPayFullConfirm(amount)),
      actions: [
        TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(l10n.cancel)),
        FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: Text(l10n.warehouseAccountPaySave)),
      ],
    ),
  );
  if (ok != true) return;
  final saved = await cubit.recordPayment(
    pharmacyId: row.pharmacyId,
    amountSyp: row.balanceSyp,
    idempotencyKey: const Uuid().v4(),
  );
  messenger.showSnackBar(
    SnackBar(content: Text(saved ? l10n.warehouseAccountPayRecorded(amount) : l10n.warehouseAccountPayFailed)),
  );
}

/// "Part payment": asks how much was paid, shows what is left, records it.
Future<void> payAccountPartly(BuildContext context, WarehouseAccountRow row) async {
  final l10n = context.l10n;
  final cubit = context.read<WarehouseAccountsCubit>();
  final messenger = ScaffoldMessenger.of(context);
  final paid = await showModalBottomSheet<double>(
    context: context,
    isScrollControlled: true,
    builder: (_) => AccountPartPaymentSheet(owedSyp: row.balanceSyp),
  );
  if (paid == null) return;
  final saved = await cubit.recordPayment(
    pharmacyId: row.pharmacyId,
    amountSyp: paid,
    idempotencyKey: const Uuid().v4(),
  );
  messenger.showSnackBar(
    SnackBar(
      content: Text(
        saved ? l10n.warehouseAccountPayRecorded(formatSyp(paid, l10n.currencySuffix)) : l10n.warehouseAccountPayFailed,
      ),
    ),
  );
}

class AccountPartPaymentSheet extends StatefulWidget {
  const AccountPartPaymentSheet({super.key, required this.owedSyp});

  final double owedSyp;

  @override
  State<AccountPartPaymentSheet> createState() => _AccountPartPaymentSheetState();
}

class _AccountPartPaymentSheetState extends State<AccountPartPaymentSheet> {
  final TextEditingController _amount = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  int? get _paid => parseWholeLiras(_amount.text);

  void _save() {
    final paid = _paid;
    if (paid == null || paid <= 0 || paid >= widget.owedSyp) {
      setState(() => _error = context.l10n.warehouseAccountPayInvalid);
      return;
    }
    Navigator.of(context).pop(paid.toDouble());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final suffix = l10n.currencySuffix;
    final left = widget.owedSyp - (_paid ?? 0);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: Padding(
          padding: AppPadding.screen,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.warehouseAccountPayPartial, style: context.textTheme.titleMedium),
              const SizedBox(height: AppSizes.spacingSmall),
              Text(l10n.warehouseAccountPayOwes(formatSyp(widget.owedSyp, suffix))),
              const SizedBox(height: AppSizes.spacingMedium),
              TextField(
                controller: _amount,
                autofocus: true,
                keyboardType: TextInputType.number,
                inputFormatters: const [WesternDigitsFormatter()],
                onChanged: (_) => setState(() => _error = null),
                decoration: InputDecoration(labelText: l10n.warehouseCollectPaidLabel(suffix), errorText: _error),
              ),
              const SizedBox(height: AppSizes.spacingSmall),
              Text(l10n.warehouseCollectLeft(formatSyp(left < 0 ? 0 : left, suffix))),
              const SizedBox(height: AppSizes.spacingMedium),
              FilledButton(onPressed: _save, child: Text(l10n.warehouseAccountPaySave)),
            ],
          ),
        ),
      ),
    );
  }
}
