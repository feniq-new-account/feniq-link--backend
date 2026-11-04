import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/config/app_config.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_dialog.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/panel/panel_home_view.dart';
import 'package:feniq/routes/route_names.dart';

/// The warehouse account: who is signed in, the way to the full web panel for
/// everything that is not in the app yet, and the two account actions.
class WarehouseAccountTab extends StatelessWidget {
  const WarehouseAccountTab({super.key, this.openUrl = openPanelExternally});

  final PanelUrlOpener openUrl;

  Future<void> _openPanel(BuildContext context) async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    var opened = false;
    try {
      opened = await openUrl(Uri.parse(AppConfig.panelUrl));
    } catch (_) {
      opened = false;
    }
    if (!opened) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.panelHomeOpenFailed(AppConfig.panelUrl))));
    }
  }

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

    return ListView(
      padding: AppPadding.screen,
      children: [
        CustomCard(
          child: Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: AppColors.primaryOf(context).withValues(alpha: 0.12),
                child: Icon(Icons.warehouse_outlined, color: AppColors.primaryOf(context)),
              ),
              const SizedBox(width: AppSizes.spacingMedium),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user?.name ?? '', style: context.textTheme.titleMedium),
                    if (user != null)
                      Text(
                        user.phone,
                        textDirection: TextDirection.ltr,
                        style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        CustomCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.warehouseAccountPanelHint,
                style: context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context)),
              ),
              const SizedBox(height: AppSizes.spacingMedium),
              PrimaryButton(label: l10n.panelHomeOpenPanel, onPressed: () => _openPanel(context)),
            ],
          ),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        if (user?.canConfigureFeatures == true) CustomCard(
          onTap: () => context.pushNamed(RouteNames.warehouseFeaturePreferences),
          child: Row(children: [const Icon(Icons.tune), const SizedBox(width: 12),
            Expanded(child: Text(l10n.featurePreferencesTitle)), const Icon(Icons.chevron_right)]),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        CustomCard(onTap: () => context.pushNamed(RouteNames.warehouseDelivery), child: Row(children: [
          const Icon(Icons.local_shipping_outlined), const SizedBox(width: 12),
          Expanded(child: Text(l10n.deliveryTitle, style: context.textTheme.titleSmall)), const Icon(Icons.chevron_right),
        ])),
        const SizedBox(height: AppSizes.spacingMedium),
        CustomCard(
          onTap: () => context.pushNamed(RouteNames.warehouseLoyalty),
          child: Row(
            children: [
              const Icon(Icons.loyalty_outlined),
              const SizedBox(width: AppSizes.spacingMedium),
              Expanded(child: Text(l10n.warehouseLoyaltyTitle, style: context.textTheme.titleSmall)),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        CustomCard(
          onTap: () => context.pushNamed(RouteNames.changePassword),
          child: Row(
            children: [
              const Icon(Icons.lock_outline),
              const SizedBox(width: AppSizes.spacingMedium),
              Expanded(child: Text(l10n.changePasswordTitle, style: context.textTheme.titleSmall)),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        CustomCard(
          onTap: () => _confirmLogout(context),
          child: Row(
            children: [
              Icon(Icons.logout, color: AppColors.errorOf(context)),
              const SizedBox(width: AppSizes.spacingMedium),
              Expanded(
                child: Text(
                  l10n.logout,
                  style: context.textTheme.titleSmall?.copyWith(color: AppColors.errorOf(context)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
