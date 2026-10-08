import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/app_skeleton.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/debts/data/models/debt_detail_model.dart';
import 'package:feniq/features/debts/presentation/managers/debt_detail_cubit.dart';
import 'package:feniq/features/debts/presentation/managers/debt_detail_state.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/features/debts/presentation/widgets/statement_row_tile.dart';

// Money-Flow V2. The account statement for one warehouse: every financial
// event in order, with a running balance.
//
// V1 showed two disconnected lists - delivered orders and payments - under
// three summary cards computed on a DIFFERENT basis from the rows beneath
// them (the cards live-converted a USD cache; the rows were frozen SYP), so
// after any exchange-rate move the two visibly disagreed. Here every figure is
// the same frozen SYP amount off the same immutable ledger entries.
//
// Still strictly read-only: only the warehouse's own panel can record or
// reverse a payment. This screen shows what already happened.
class DebtDetailView extends StatelessWidget {
  const DebtDetailView({super.key, required this.warehouseName});

  final String warehouseName;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: FullText(warehouseName, minScale: 0.65),
      ),
      body: BlocBuilder<DebtDetailCubit, DebtDetailState>(
        builder: (context, state) {
          if (state.status == DebtDetailStatus.initial ||
              state.status == DebtDetailStatus.loading) {
            // The balance summary card, then the statement rows under their
            // heading.
            return const SkeletonPage(
              children: [
                SkeletonCard(
                  children: [
                    SkeletonBar(width: 140, height: 12),
                    SizedBox(height: AppSizes.spacingSmall),
                    SkeletonBar(width: 180, height: 28),
                    SizedBox(height: AppSizes.spacingMedium),
                    SkeletonBar(height: 12),
                  ],
                ),
                SizedBox(height: AppSizes.spacingXLarge),
                SkeletonBar(width: 110, height: 16),
                SizedBox(height: AppSizes.spacingSmall),
                SkeletonListCard(),
                SizedBox(height: AppSizes.spacingSmall),
                SkeletonListCard(),
                SizedBox(height: AppSizes.spacingSmall),
                SkeletonListCard(),
              ],
            );
          }
          if (state.status == DebtDetailStatus.error || state.detail == null) {
            return FailureWidget(
              message: translateErrorCode(
                l10n,
                state.errorCode,
                state.errorMessage ?? l10n.errorState,
              ),
              onRetry: () => context.read<DebtDetailCubit>().load(),
            );
          }

          final detail = state.detail!;
          return ListView(
            padding: AppPadding.screen,
            children: [
              _BalanceSummaryCard(detail: detail),
              const SizedBox(height: AppSizes.spacingXLarge),
              Text(l10n.statementTitle, style: context.textTheme.titleMedium),
              const SizedBox(height: AppSizes.spacingSmall),
              if (detail.rows.isEmpty)
                EmptyView(message: l10n.statementEmpty, icon: Icons.receipt_long_outlined)
              else
                CustomCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // The opening balance is its own row, so the running
                      // total in the rows below starts from something visible.
                      _OpeningRow(detail: detail),
                      for (final row in detail.rows) ...[
                        const Divider(height: AppSizes.spacingLarge),
                        StatementRowTile(row: row),
                      ],
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _BalanceSummaryCard extends StatelessWidget {
  const _BalanceSummaryCard({required this.detail});

  final DebtDetailModel detail;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isCredit = detail.isCredit;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // The period's movement. These are sums of the very rows below, so
          // the two can never tell different stories.
          _SummaryLine(label: l10n.statementCharges, valueSyp: detail.summary.chargesSyp),
          const SizedBox(height: AppSizes.spacingSmall),
          _SummaryLine(label: l10n.statementPayments, valueSyp: detail.summary.paymentsSyp),
          if (detail.summary.returnCreditsSyp > 0) ...[
            const SizedBox(height: AppSizes.spacingSmall),
            _SummaryLine(
              label: l10n.statementReturnCredits,
              valueSyp: detail.summary.returnCreditsSyp,
            ),
          ],
          const Divider(height: AppSizes.spacingLarge),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: FullText(
                  isCredit ? l10n.creditBalanceLabel : l10n.currentBalanceLabel,
                  style: context.textTheme.titleMedium),
              ),
              const SizedBox(width: AppSizes.spacingSmall),
              Flexible(
                child: Text(
                  formatSyp(
                    isCredit ? detail.creditBalanceSyp : detail.outstandingDebtSyp,
                    l10n.currencySuffix,
                  ),
                  style: context.textTheme.titleMedium?.copyWith(
                    color: isCredit
                        ? AppColors.secondaryOf(context)
                        : AppColors.errorOf(context),
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryLine extends StatelessWidget {
  const _SummaryLine({required this.label, required this.valueSyp});

  final String label;
  final num valueSyp;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Flexible(
          child: FullText(
            label,
            style: context.textTheme.bodyMedium?.copyWith(
              color: AppColors.textSecondaryOf(context),
            )),
        ),
        Flexible(
          // No ellipsis on a monetary figure - truncating it would read as a
          // different, smaller number. It wraps instead if genuinely squeezed.
          child: Text(
            formatSyp(valueSyp, context.l10n.currencySuffix),
            style: context.textTheme.bodyMedium,
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }
}

class _OpeningRow extends StatelessWidget {
  const _OpeningRow({required this.detail});

  final DebtDetailModel detail;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Text(
            l10n.statementOpening,
            style: context.textTheme.bodyMedium?.copyWith(
              color: AppColors.textSecondaryOf(context),
            ),
          ),
        ),
        Text(
          formatSyp(detail.openingSyp, l10n.currencySuffix),
          style: context.textTheme.bodyMedium?.copyWith(
            color: AppColors.textSecondaryOf(context),
          ),
        ),
      ],
    );
  }
}

// One financial event. The amount is signed by colour and prefix rather than a
// bare minus: a charge adds to what is owed, everything else takes away from it.
