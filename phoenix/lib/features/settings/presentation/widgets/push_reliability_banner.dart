import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/permissions/app_permissions.dart';
import 'package:feniq/routes/route_names.dart';

/// Shown on the manager's orders tab while something on this phone can hold
/// back a new-order push (banners off, or the battery saver allowed to put
/// Feniq to sleep). One tap opens "App permissions". Hidden otherwise, and
/// re-checked whenever the app comes back to the front.
class PushReliabilityBanner extends StatefulWidget {
  const PushReliabilityBanner({super.key, this.service});

  final AppPermissionsService? service;

  @override
  State<PushReliabilityBanner> createState() => _PushReliabilityBannerState();
}

class _PushReliabilityBannerState extends State<PushReliabilityBanner> with WidgetsBindingObserver {
  bool _show = false;

  AppPermissionsService get _service => widget.service ?? AppPermissionsService.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _check();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _check();
  }

  Future<void> _check() async {
    final delayed = await _service.pushMayBeDelayed();
    if (mounted && delayed != _show) setState(() => _show = delayed);
  }

  @override
  Widget build(BuildContext context) {
    if (!_show) return const SizedBox.shrink();
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSizes.spacingMedium, 0, AppSizes.spacingMedium, AppSizes.spacingSmall),
      child: Material(
        color: AppColors.warningSurfaceOf(context),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsetsDirectional.only(start: AppSizes.spacingMedium),
          child: Row(
            children: [
              Icon(Icons.notifications_paused_outlined, color: AppColors.warningOf(context)),
              const SizedBox(width: AppSizes.spacingSmall),
              Expanded(child: Text(l10n.pushDelayedBannerText)),
              TextButton(
                onPressed: () async {
                  await context.pushNamed(RouteNames.appPermissions);
                  _check();
                },
                child: Text(l10n.pushDelayedBannerAction),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
