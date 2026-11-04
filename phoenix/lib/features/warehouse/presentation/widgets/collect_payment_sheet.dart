import 'package:feniq/core/utils/number_input.dart';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/features/warehouse/presentation/views/warehouse_loyalty_view.dart' show parseWholeLiras;

/// Asked when the warehouse taps "delivered": did it collect the money?
/// Three choices side by side - all of it, part of it, or later. Returns the
/// amount collected in SYP (0 for "later"), or null when the sheet was closed
/// without a choice (the order is then not delivered).
Future<double?> showCollectPaymentSheet(BuildContext context, {required int orderNumber, required double totalSyp}) {
  return showModalBottomSheet<double>(
    context: context,
    isScrollControlled: true,
    builder: (_) => CollectPaymentSheet(orderNumber: orderNumber, totalSyp: totalSyp),
  );
}

class CollectPaymentSheet extends StatefulWidget {
  const CollectPaymentSheet({super.key, required this.orderNumber, required this.totalSyp});

  final int orderNumber;
  final double totalSyp;

  @override
  State<CollectPaymentSheet> createState() => _CollectPaymentSheetState();
}

class _CollectPaymentSheetState extends State<CollectPaymentSheet> {
  final TextEditingController _amount = TextEditingController();
  bool _partial = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  int? get _paid => parseWholeLiras(_amount.text);

  void _savePartial() {
    final paid = _paid;
    if (paid == null || paid <= 0 || paid >= widget.totalSyp) {
      setState(() => _error = context.l10n.warehouseCollectPartialInvalid);
      return;
    }
    Navigator.of(context).pop(paid.toDouble());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final suffix = l10n.currencySuffix;
    final paid = _paid ?? 0;
    final left = widget.totalSyp - paid;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: Padding(
          padding: AppPadding.screen,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l10n.warehouseCollectTitle(widget.orderNumber), style: context.textTheme.titleMedium),
                const SizedBox(height: AppSizes.spacingSmall),
                Text(l10n.warehouseCollectTotal(formatSyp(widget.totalSyp, suffix))),
                const SizedBox(height: AppSizes.spacingMedium),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton(
                        onPressed: () => Navigator.of(context).pop(widget.totalSyp),
                        child: Text(l10n.warehouseCollectFull),
                      ),
                    ),
                    const SizedBox(width: AppSizes.spacingSmall),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => setState(() => _partial = true),
                        child: Text(l10n.warehouseCollectPartial),
                      ),
                    ),
                    const SizedBox(width: AppSizes.spacingSmall),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(0.0),
                        child: Text(l10n.warehouseCollectLater),
                      ),
                    ),
                  ],
                ),
                if (_partial) ...[
                  const SizedBox(height: AppSizes.spacingMedium),
                  TextField(
                    controller: _amount,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    textDirection: TextDirection.ltr,
                    inputFormatters: const [WesternDigitsFormatter()],
                    onChanged: (_) => setState(() => _error = null),
                    decoration: InputDecoration(labelText: l10n.warehouseCollectPaidLabel(suffix), errorText: _error),
                  ),
                  const SizedBox(height: AppSizes.spacingSmall),
                  Text(l10n.warehouseCollectLeft(formatSyp(left < 0 ? 0 : left, suffix))),
                  const SizedBox(height: AppSizes.spacingMedium),
                  FilledButton(onPressed: _savePartial, child: Text(l10n.warehouseCollectSave)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Records what was collected on delivery as a cash payment from the pharmacy,
/// noting the order. True when the server took it.
Future<bool> recordCollectedPayment(
  WarehouseManagementRepository repository, {
  required String pharmacyId,
  required double amountSyp,
  required int orderNumber,
  required String note,
}) async {
  try {
    await repository.recordPayment(
      pharmacyId: pharmacyId,
      amountSyp: amountSyp,
      method: 'cash',
      idempotencyKey: const Uuid().v4(),
      note: note,
    );
    return true;
  } catch (_) {
    return false;
  }
}
