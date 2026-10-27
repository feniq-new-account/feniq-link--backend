import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/services/pending_payment_journal.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

/// A lost network response is an unresolved operation, not a failed payment.
/// Keep recovery visible across tabs and app restarts, using the saved payload.
class PendingPaymentsBar extends StatefulWidget {
  const PendingPaymentsBar({super.key});

  @override
  State<PendingPaymentsBar> createState() => _PendingPaymentsBarState();
}

class _PendingPaymentsBarState extends State<PendingPaymentsBar> {
  List<PendingPaymentRecord> _pending = [];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    PendingPaymentJournal.changes.addListener(_reload);
    _reload();
  }

  @override
  void dispose() {
    PendingPaymentJournal.changes.removeListener(_reload);
    super.dispose();
  }

  Future<void> _reload() async {
    try {
      final rows = await context
          .read<WarehouseManagementRepository>()
          .getPendingPayments();
      if (mounted) setState(() => _pending = rows);
    } catch (_) {
      // A storage/plugin failure cannot stop the rest of the warehouse UI.
    }
  }

  Future<void> _retry(PendingPaymentRecord record) async {
    setState(() => _saving = true);
    try {
      final p = record.payload;
      await context.read<WarehouseManagementRepository>().recordPayment(
        pharmacyId: p['pharmacyId'] as String,
        amountSyp: (p['amount'] as num).toDouble(),
        method: p['method'] as String,
        note: p['note'] as String?,
        deliveryOrderId: p['deliveryOrderId'] as String?,
        idempotencyKey: record.key,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.warehousePaymentRecorded)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.paymentUnconfirmed)),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_pending.isEmpty) return const SizedBox.shrink();
    final record = _pending.first;
    final amount = formatSyp(
      (record.payload['amount'] as num).toDouble(),
      context.l10n.currencySuffix,
    );
    return MaterialBanner(
      content: Text(
        '${context.l10n.paymentUnconfirmed}\n$amount${record.payload['note'] == null ? '' : ' · ${record.payload['note']}'}',
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => _retry(record),
          child: Text(context.l10n.retryButton),
        ),
      ],
    );
  }
}
