import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import '../managers/rep_load_status.dart';
import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/app_dialog.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/rep/presentation/managers/rep_home_cubit.dart';
import 'package:feniq/features/rep/presentation/utils/rep_labels.dart';
import 'package:feniq/features/rep/presentation/widgets/rep_stat_tile.dart';
import 'package:feniq/routes/route_names.dart';

/// The rep's own account: who they are, which warehouse they work for, their
/// month so far, and the two account actions (change password, sign out).
class RepProfileTab extends StatelessWidget {
  const RepProfileTab({super.key});

  void _confirmLogout(BuildContext context) {
    final l10n = context.l10n;
    final authCubit = context.read<AuthCubit>();
    AppDialog.show(
      context: context,
      title: l10n.logoutConfirmTitle,
      content: l10n.logoutConfirmMessage,
      actionLabel: l10n.logout,
      onAction: () async {
        await authCubit.logout();
        if (context.mounted) context.goNamed(RouteNames.login);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final user = context.select((AuthCubit cubit) => cubit.state.user);

    return BlocBuilder<RepHomeCubit, RepHomeState>(
      builder: (context, state) {
        final me = state.me;
        final name = me?.name ?? user?.name ?? '';
        final phone = me?.phone ?? user?.phone ?? '';
        final warehouse = me?.warehouse;
        final stats = me?.stats;

        return ListView(
          padding: AppPadding.screen,
          children: [
            if (state.status == RepLoadStatus.loading) const LinearProgressIndicator(),
            if (state.status == RepLoadStatus.error)
              FailureWidget(
                dense: true,
                message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                onRetry: () => context.read<RepHomeCubit>().load(),
              ),
            CustomCard(
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: AppColors.primaryOf(context).withValues(alpha: 0.12),
                    child: Icon(Icons.badge_outlined, color: AppColors.primaryOf(context)),
                  ),
                  const SizedBox(width: AppSizes.spacingMedium),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: context.textTheme.titleMedium),
                        if (phone.isNotEmpty)
                          Text(
                            ltrIsolate(phone),
                            style: context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context)),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (warehouse != null) ...[
              const SizedBox(height: AppSizes.spacingSmall),
              CustomCard(
                child: Row(
                  children: [
                    Icon(Icons.warehouse_outlined, color: AppColors.textOf(context)),
                    const SizedBox(width: AppSizes.spacingMedium),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.repWarehouseLabel,
                            style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                          ),
                          Text(englishFirst(warehouse.nameEn, warehouse.nameAr), style: context.textTheme.titleSmall),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (stats != null) ...[
              const SizedBox(height: AppSizes.spacingMedium),
              ResponsiveStatsGrid(
                minTileWidth: 140,
                maxColumns: 2,
                children: [
                  RepStatTile(value: '${stats.pharmacyCount}', label: l10n.repStatPharmacies),
                  RepStatTile(value: '${stats.visitsLast7Days}', label: l10n.repStatVisitsWeek),
                  RepStatTile(value: '${stats.monthOrdersCount}', label: l10n.repStatOrdersMonth),
                  RepStatTile(
                    value: formatSyp(stats.monthOrdersTotal, l10n.currencySuffix),
                    label: l10n.repStatSalesMonth,
                  ),
                ],
              ),
              if (stats.hasCommission) ...[
                const SizedBox(height: AppSizes.spacingSmall),
                RepStatTile(
                  value: formatSyp(stats.monthCommissionAmount, l10n.currencySuffix),
                  label: l10n.repStatCommissionMonth,
                ),
                const SizedBox(height: AppSizes.spacingSmall),
                Text(
                  l10n.repCommissionHint(repPercent(stats.ownCommissionRate)),
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                ),
              ],
            ],
            const SizedBox(height: AppSizes.spacingMedium),
            Text(
              l10n.repProfileHint,
              style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
            ),
            const SizedBox(height: AppSizes.spacingMedium),
            CustomCard(
              onTap: () => context.pushNamed(RouteNames.changePassword),
              child: Row(
                children: [
                  Icon(Icons.lock_outline, size: 22, color: AppColors.textOf(context)),
                  const SizedBox(width: AppSizes.spacingMedium),
                  Expanded(child: Text(l10n.changePasswordTitle, style: context.textTheme.titleSmall)),
                  Icon(Icons.chevron_right, size: AppSizes.iconSizeSmall, color: AppColors.textSecondaryOf(context)),
                ],
              ),
            ),
            const SizedBox(height: AppSizes.spacingXLarge),
            SizedBox(
              width: double.infinity,
              height: AppSizes.buttonHeight,
              child: OutlinedButton.icon(
                onPressed: () => _confirmLogout(context),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.errorOf(context),
                  side: BorderSide(color: AppColors.errorOf(context), width: 1.5),
                  shape: const RoundedRectangleBorder(borderRadius: AppRadius.medium),
                  padding: AppPadding.button,
                ),
                icon: const Icon(Icons.logout),
                label: Text(l10n.logout),
              ),
            ),
          ],
        );
      },
    );
  }
}
