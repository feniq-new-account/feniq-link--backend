import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/features/debts/data/models/debt_detail_model.dart';

/// One line of an account statement: what happened, when, what it refers
/// to, the amount and the running balance. Shared by the pharmacy's own debt
/// screen and the warehouse's view of a pharmacy's account - the labels are
/// neutral, so both sides read it the same way.
class StatementRowTile extends StatelessWidget {
  const StatementRowTile({super.key, required this.row});

  final StatementRowModel row;

  String _label(BuildContext context) {
    final l10n = context.l10n;
    switch (row.kind) {
      case 'charge':
        return l10n.statementKindCharge;
      case 'charge_reversal':
        return l10n.statementKindChargeReversal;
      case 'payment':
        return l10n.statementKindPayment;
      case 'payment_reversal':
        return l10n.statementKindPaymentReversal;
      case 'return_credit':
        return l10n.statementKindReturnCredit;
      case 'return_credit_reversal':
        return l10n.statementKindReturnCreditReversal;
      case 'manual_credit':
        return l10n.statementKindManualCredit;
      case 'manual_debit':
        return l10n.statementKindManualDebit;
      default:
        return l10n.statementKindOther;
    }
  }

  String? _reference(BuildContext context) {
    final l10n = context.l10n;
    final ref = row.reference;
    if (ref.invoiceNumber != null) {
      return l10n.statementInvoiceRef(ref.invoiceNumber.toString());
    }
    if (ref.paymentNumber != null) {
      return l10n.statementPaymentRef(ref.paymentNumber.toString());
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reference = _reference(context);
    // A debit is money the pharmacy now owes; everything else reduces it.
    final color = row.isDebit ? AppColors.errorOf(context) : AppColors.secondaryOf(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_label(context), style: context.textTheme.bodyMedium),
              const SizedBox(height: 2),
              Text(
                DateFormatter.formatDate(row.effectiveAt),
                style: context.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondaryOf(context),
                ),
              ),
              if (reference != null)
                Text(
                  reference,
                  style: context.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondaryOf(context),
                  ),
                ),
              // Mandatory on adjustments and reversals - it is what makes
              // those rows legible rather than an unexplained movement.
              if (row.reason != null && row.reason!.isNotEmpty)
                Text(row.reason!, style: context.textTheme.bodySmall),
            ],
          ),
        ),
        const SizedBox(width: AppSizes.spacingSmall),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${row.isDebit ? '+' : '−'} ${formatSyp(row.amountSyp, l10n.currencySuffix)}',
              style: context.textTheme.bodyMedium?.copyWith(
                color: color,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              formatSyp(row.balanceSyp, l10n.currencySuffix),
              style: context.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondaryOf(context),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
