import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/debouncer.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_accounts_cubit.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_summary_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_paged_list.dart';
import 'package:feniq/features/warehouse/presentation/widgets/account_payment.dart';
import 'package:feniq/features/warehouse/presentation/widgets/warehouse_summary_card.dart';
import 'package:feniq/features/warehouse/presentation/widgets/warehouse_collection_accounting_card.dart';
import 'package:feniq/features/warehouse/presentation/widgets/voice_payment_sheet.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_permissions.dart';

/// Where every pharmacy's account stands with the warehouse, largest balance
/// owed first; a tap opens its statement (and recording a payment).
class WarehouseAccountsTab extends StatefulWidget {
  const WarehouseAccountsTab({super.key});

  @override
  State<WarehouseAccountsTab> createState() => _WarehouseAccountsTabState();
}

class _WarehouseAccountsTabState extends State<WarehouseAccountsTab> {
  final ScrollController _controller = ScrollController();
  final TextEditingController _search = TextEditingController();
  final Debouncer _debouncer = Debouncer(duration: const Duration(milliseconds: 400));

  @override
  void initState() {
    super.initState();
    listenForEnd(_controller, () => context.read<WarehouseAccountsCubit>().loadMore());
  }

  @override
  void dispose() {
    _controller.dispose();
    _search.dispose();
    _debouncer.cancel();
    super.dispose();
  }

  Future<void> _open(WarehouseAccountRow row) async {
    final cubit = context.read<WarehouseAccountsCubit>();
    final changed = await context.pushNamed<bool>(
      RouteNames.warehouseAccount,
      pathParameters: {'pharmacyId': row.pharmacyId},
    );
    // A payment moved the balance: the list order and figures follow it.
    if (changed == true) cubit.load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSizes.spacingMedium, AppSizes.spacingSmall, AppSizes.spacingMedium, 0),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _search,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search_outlined),
                    labelText: l10n.warehouseAccountsSearch,
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    suffixIcon: _search.text.isEmpty ? null : IconButton(
                      tooltip: MaterialLocalizations.of(context).deleteButtonTooltip,
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        _debouncer.cancel();
                        _search.clear();
                        context.read<WarehouseAccountsCubit>().setSearch('');
                        setState(() {});
                      },
                    ),
                  ),
                  onChanged: (text) {
                    setState(() {});
                    _debouncer.run(() {
                      if (mounted) context.read<WarehouseAccountsCubit>().setSearch(text);
                    });
                  },
                ),
              ),
              if (canRecordWarehousePayments(context)) IconButton(
                tooltip: l10n.warehouseVoiceTitle,
                icon: const Icon(Icons.mic),
                onPressed: () => showVoicePaymentSheet(context),
              ),
            ],
          ),
        ),
        Expanded(
          // A pull to refresh or a recorded payment reloads the accounts; the
          // summary's figures move with them. The first load is skipped
          // (nothing listed yet): the router already started the summary.
          child: BlocListener<WarehouseAccountsCubit, WarehouseAccountsState>(
            listenWhen: (previous, current) =>
                previous.status == RepLoadStatus.loading &&
                current.status == RepLoadStatus.loaded &&
                previous.accounts.isNotEmpty &&
                previous.search == current.search,
            listener: (context, _) => context.read<WarehouseSummaryCubit>().load(),
            child: BlocBuilder<WarehouseAccountsCubit, WarehouseAccountsState>(
              builder: (context, state) => AppRefreshIndicator(
                onRefresh: () => context.read<WarehouseAccountsCubit>().load(),
                child: WarehousePagedList(
                  header: const Padding(
                    padding: EdgeInsets.only(bottom: AppSizes.spacingSmall),
                    child: Column(
                      children: [
                        WarehouseCollectionAccountingCard(),
                        SizedBox(height: AppSizes.spacingSmall),
                        // Canonical debt and receipts remain ledger-backed.
                        WarehouseSummaryCard(),
                      ],
                    ),
                  ),
                  controller: _controller,
                  itemCount: state.accounts.length,
                  isLoading: state.status == RepLoadStatus.initial || state.status == RepLoadStatus.loading,
                  isLoadingMore: state.isLoadingMore,
                  errorMessage: state.status == RepLoadStatus.error
                      ? translateErrorCode(l10n, state.errorCode, state.errorMessage ?? '')
                      : null,
                  onRetry: () => context.read<WarehouseAccountsCubit>().load(),
                  emptyTitle: l10n.warehouseNoAccountsTitle,
                  emptySubtitle: l10n.warehouseNoAccountsSubtitle,
                  emptyIcon: Icons.account_balance_wallet_outlined,
                  itemBuilder: (context, index) {
                    final row = state.accounts[index];
                    final muted = context.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondaryOf(context));
                    final suffix = l10n.currencySuffix;
                    final balanceColor = row.balanceSyp > 0
                        ? AppColors.errorOf(context)
                        : row.balanceSyp < 0
                            ? AppColors.secondaryOf(context)
                            : AppColors.textSecondaryOf(context);
                    return CustomCard(
                      onTap: () => _open(row),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              DecoratedBox(
                                decoration: BoxDecoration(
                                  color: AppColors.primaryOf(context).withValues(alpha: 0.11),
                                  borderRadius: BorderRadius.circular(11),
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.all(10),
                                  child: Icon(Icons.local_pharmacy_outlined,
                                    size: 22, color: AppColors.primaryTextOf(context)),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  warehouseLocalName(context, row.nameAr, row.nameEn),
                                  style: context.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textOf(context),
                                  ),
                                ),
                              ),
                              Icon(Icons.arrow_forward_ios_rounded,
                                size: 15, color: AppColors.textSecondaryOf(context)),
                            ],
                          ),
                          const SizedBox(height: 12),
                          DecoratedBox(
                            decoration: BoxDecoration(
                              color: balanceColor.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: balanceColor.withValues(alpha: 0.15)),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              child: Row(
                                children: [
                                  Icon(Icons.account_balance_wallet_outlined,
                                    size: 19, color: balanceColor),
                                  const SizedBox(width: 9),
                                  Expanded(child: WarehouseBalanceText(balanceSyp: row.balanceSyp)),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 14,
                            runSpacing: 6,
                            children: [
                              Text(l10n.warehouseAccountPurchases(formatSyp(row.purchasesSyp, suffix)), style: muted),
                              Text(l10n.warehouseAccountPaid(formatSyp(row.paidSyp, suffix)), style: muted),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Icon(Icons.history, size: 15,
                                color: AppColors.textSecondaryOf(context)),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  row.lastPaymentAt == null
                                      ? l10n.warehouseAccountNoPayment
                                      : l10n.warehouseAccountLastPayment(
                                          DateFormatter.formatDate(row.lastPaymentAt!.toLocal(), locale: l10n.localeName),
                                        ),
                                  style: muted,
                                ),
                              ),
                            ],
                          ),
                          if (row.balanceSyp > 0 && canRecordWarehousePayments(context)) ...[
                            const SizedBox(height: AppSizes.spacingMedium),
                            Row(
                              children: [
                                Expanded(
                                  child: FilledButton(
                                    onPressed: () => payAccountInFull(context, row),
                                    child: Text(l10n.warehouseAccountPayFull),
                                  ),
                                ),
                                const SizedBox(width: AppSizes.spacingSmall),
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () => payAccountPartly(context, row),
                                    child: Text(l10n.warehouseAccountPayPartial),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    );

                  },
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// "Owes X" in red, "In credit X" in green, or "Settled".
class WarehouseBalanceText extends StatelessWidget {
  const WarehouseBalanceText({super.key, required this.balanceSyp, this.large = false});

  final double balanceSyp;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final base = large ? context.textTheme.titleLarge : context.textTheme.bodyMedium;
    if (balanceSyp == 0) {
      return Text(l10n.warehouseAccountSettled, style: base?.copyWith(color: AppColors.textSecondaryOf(context)));
    }
    final owes = balanceSyp > 0;
    final amount = formatSyp(balanceSyp.abs(), l10n.currencySuffix);
    return Text(
      owes ? l10n.warehouseAccountOwes(amount) : l10n.warehouseAccountInCredit(amount),
      style: base?.copyWith(
        fontWeight: FontWeight.w700,
        color: owes ? AppColors.errorOf(context) : AppColors.secondaryOf(context),
      ),
    );
  }
}
