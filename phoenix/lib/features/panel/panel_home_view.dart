import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:feniq/config/app_config.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_dialog.dart';
import 'package:feniq/core/widgets/brand_logo.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/core/widgets/secondary_button.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/routes/route_names.dart';

/// Opens [url] outside the app; true when it opened. Replaceable so tests
/// need no platform channel.
typedef PanelUrlOpener = Future<bool> Function(Uri url);

Future<bool> openPanelExternally(Uri url) => launchUrl(url, mode: LaunchMode.externalApplication);

/// Landing page for panel accounts in the one Feniq app. The external panel
/// supplies the tools allowed by that account's role and permissions.
class PanelHomeView extends StatelessWidget {
  const PanelHomeView({super.key, this.openUrl = openPanelExternally});

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
    final name = context.select((AuthCubit cubit) => cubit.state.user?.name) ?? '';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: Text(l10n.panelHomeTitle),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: AppPadding.screen,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: AppSizes.spacingLarge),
                  const Center(child: BrandLogo(width: 140)),
                  const SizedBox(height: AppSizes.spacingLarge),
                  Text(
                    l10n.panelHomeGreeting(name),
                    style: context.textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSizes.spacingSmall),
                  Text(
                    l10n.panelHomeBody,
                    style: context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context)),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSizes.spacingXLarge),
                  PrimaryButton(label: l10n.panelHomeOpenPanel, onPressed: () => _openPanel(context)),
                  const SizedBox(height: AppSizes.spacingMedium),
                  SecondaryButton(label: l10n.logout, onPressed: () => _confirmLogout(context)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
