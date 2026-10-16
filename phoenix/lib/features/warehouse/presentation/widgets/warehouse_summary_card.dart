import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_summary_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';
import 'package:feniq/generated/app_localizations.dart';

/// The owner's summary at the top of the Accounts tab: a period picker, four
/// headline figures, and the top buyers and biggest debts. Every number is a
/// ledger sum the server already netted; nothing is computed from the list
/// of pharmacies below it.
class WarehouseSummaryCard extends StatelessWidget {
  const WarehouseSummaryCard({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<WarehouseSummaryCubit, WarehouseSummaryState>(
      builder: (context, state) {
        final summary = state.summary;
        return CustomCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.warehouseSummaryTitle,
                style: context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: AppSizes.spacingSmall),
              Wrap(
                spacing: AppSizes.spacingSmall,
                children: [
                  for (final period in kSummaryPeriods)
                    ChoiceChip(
                      label: Text(_periodLabel(l10n, period)),
                      selected: state.period == period,
                      onSelected: (_) => context.read<WarehouseSummaryCubit>().setPeriod(period),
                    ),
                ],
              ),
              const SizedBox(height: AppSizes.spacingMedium),
              if (summary != null)
                SummaryFigures(summary: summary)
              else if (state.status == RepLoadStatus.error)
                FailureWidget(
                  dense: true,
                  message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                  onRetry: () => context.read<WarehouseSummaryCubit>().load(),
                )
              else
                const Padding(
                  padding: EdgeInsets.all(AppSizes.spacingMedium),
                  child: Center(child: CircularProgressIndicator()),
                ),
              const SizedBox(height: AppSizes.spacingSmall),
              Text(
                l10n.warehouseSummaryDeliveredNote,
                style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
              ),
            ],
          ),
        );
      },
    );
  }
}

String _periodLabel(AppLocalizations l10n, String period) => switch (period) {
  'week' => l10n.warehouseSummaryWeek,
  'month' => l10n.warehouseSummaryMonth,
  _ => l10n.warehouseSummaryToday,
};

/// The figures themselves, separate from fetching so they build from a plain
/// [WarehouseSummary].
class SummaryFigures extends StatelessWidget {
  const SummaryFigures({super.key, required this.summary});

  final WarehouseSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final suffix = l10n.currencySuffix;
    final current = summary.current;
    final previous = summary.previous;
    final outstanding = summary.outstanding;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _Stat(
                label: l10n.warehouseSummarySales,
                value: formatSyp(current.salesSyp, suffix),
                sub: l10n.warehouseSummaryInvoices(current.invoiceCount),
                change: _Change(current: current.salesSyp, previous: previous.salesSyp),
              ),
            ),
            const SizedBox(width: AppSizes.spacingSmall),
            Expanded(
              child: _Stat(
                label: l10n.warehouseSummaryCollections,
                value: formatSyp(current.collectionsSyp, suffix),
                valueColor: AppColors.secondaryOf(context),
                sub: l10n.warehouseSummaryPayments(current.paymentCount),
                change: _Change(current: current.collectionsSyp, previous: previous.collectionsSyp),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _Stat(label: l10n.warehouseSummaryReturns, value: formatSyp(current.returnsSyp, suffix)),
            ),
            const SizedBox(width: AppSizes.spacingSmall),
            Expanded(
              child: _Stat(
                label: l10n.warehouseSummaryTotalDebts,
                value: formatSyp(outstanding.totalDebtSyp, suffix),
                valueColor: AppColors.errorOf(context),
                sub: l10n.warehouseSummaryDebtors(outstanding.debtorCount),
                extraSub: outstanding.totalCreditSyp > 0
                    ? l10n.warehouseSummaryCreditHeld(formatSyp(outstanding.totalCreditSyp, suffix))
                    : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        _RankedList(
          title: l10n.warehouseSummaryTopBuyers,
          emptyText: l10n.warehouseSummaryNoBuyers,
          rows: summary.topBuyers,
        ),
        const SizedBox(height: AppSizes.spacingSmall),
        _RankedList(
          title: l10n.warehouseSummaryTopDebtors,
          emptyText: l10n.warehouseSummaryNoDebtors,
          rows: outstanding.topDebtors,
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.valueColor, this.sub, this.extraSub, this.change});

  final String label;
  final String value;
  final Color? valueColor;
  final String? sub;
  final String? extraSub;
  final Widget? change;

  @override
  Widget build(BuildContext context) {
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: muted),
        const SizedBox(height: AppSizes.spacingXSmall),
        Text(
          value,
          style: context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: valueColor),
        ),
        if (sub != null) Text(sub!, style: muted),
        if (extraSub != null) Text(extraSub!, style: muted),
        ?change,
      ],
    );
  }
}

/// "▲ 50% vs previous period" in green, "▼ 50%" in red, nothing when both
/// periods are empty.
class _Change extends StatelessWidget {
  const _Change({required this.current, required this.previous});

  final double current;
  final double previous;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final percent = summaryPercentChange(current, previous);
    final String text;
    Color? color = AppColors.textSecondaryOf(context);
    if (percent == null) {
      if (current <= 0) return const SizedBox.shrink();
      text = l10n.warehouseSummaryChangeNew;
    } else if (percent == 0) {
      text = l10n.warehouseSummaryChangeFlat;
    } else if (percent > 0) {
      text = l10n.warehouseSummaryChangeUp(percent);
      color = AppColors.secondaryOf(context);
    } else {
      text = l10n.warehouseSummaryChangeDown(-percent);
      color = AppColors.errorOf(context);
    }
    return Text(text, style: context.textTheme.bodySmall?.copyWith(color: color));
  }
}

class _RankedList extends StatelessWidget {
  const _RankedList({required this.title, required this.emptyText, required this.rows});

  final String title;
  final String emptyText;
  final List<SummaryPharmacyAmount> rows;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: context.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: AppSizes.spacingXSmall),
        if (rows.isEmpty)
          Text(emptyText, style: muted)
        else
          for (var i = 0; i < rows.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  SizedBox(width: 20, child: Text('${i + 1}', style: muted)),
                  Expanded(
                    child: Text(
                      warehouseLocalName(context, rows[i].nameAr, rows[i].nameEn),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: AppSizes.spacingSmall),
                  Text(
                    formatSyp(rows[i].amountSyp, l10n.currencySuffix),
                    style: context.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}
