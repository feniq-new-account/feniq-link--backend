import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/permissions/app_permissions.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/generated/app_localizations.dart';

/// "App permissions": every permission this account's role needs, why, whether
/// it is on, and one button to turn it on. Re-reads everything when the user
/// comes back from Android's settings.
class AppPermissionsView extends StatefulWidget {
  const AppPermissionsView({super.key, this.service});

  /// Tests inject a fake; production uses the shared instance.
  final AppPermissionsService? service;

  @override
  State<AppPermissionsView> createState() => _AppPermissionsViewState();
}

class _AppPermissionsViewState extends State<AppPermissionsView> with WidgetsBindingObserver {
  AppPermissionsService get _service => widget.service ?? AppPermissionsService.instance;
  List<AppPermissionKind> _kinds = const [];
  final Map<AppPermissionKind, AppPermissionState> _states = {};
  bool _loaded = false;
  AppPermissionKind? _busy;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  PermissionAudience _audience() {
    final user = context.read<AuthCubit>().state.user;
    final role = user?.role ?? context.read<AuthCubit>().state.role ?? 'pharmacy';
    return PermissionAudience(role: role, warehouseRole: user?.warehouseRole ?? 'legacy');
  }

  Future<void> _load() async {
    if (!mounted) return;
    final audience = _audience();
    final manufacturer = await _service.manufacturer();
    final kinds = permissionsFor(audience, manufacturer: manufacturer);
    final states = <AppPermissionKind, AppPermissionState>{};
    for (final kind in kinds) {
      states[kind] = await _service.status(kind);
    }
    if (!mounted) return;
    setState(() {
      _kinds = kinds;
      _states
        ..clear()
        ..addAll(states);
      _loaded = true;
    });
  }

  Future<void> _act(AppPermissionKind kind) async {
    if (_busy != null) return;
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = kind);
    try {
      if (kind == AppPermissionKind.autostart) {
        final opened = await _service.openAutostartSettings();
        if (!opened) messenger.showSnackBar(SnackBar(content: Text(l10n.permAutostartOpenFailed)));
      } else {
        final state = await _service.request(kind);
        if (mounted) setState(() => _states[kind] = state);
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isWarehouse = _audience().role == 'warehouse';
    return Scaffold(
      appBar: AppBar(title: Text(l10n.appPermissionsTitle)),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: AppPadding.screen,
              children: [
                Text(
                  l10n.appPermissionsIntro,
                  style: context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context)),
                ),
                const SizedBox(height: AppSizes.spacingMedium),
                for (final kind in _kinds) ...[
                  _PermissionTile(
                    key: ValueKey('perm-${kind.name}'),
                    icon: _iconFor(kind),
                    title: _titleFor(l10n, kind),
                    why: _whyFor(l10n, kind, isWarehouse: isWarehouse),
                    steps: kind == AppPermissionKind.autostart ? l10n.permAutostartSteps : null,
                    state: _states[kind] ?? AppPermissionState.unknown,
                    busy: _busy == kind,
                    onAction: () => _act(kind),
                  ),
                  const SizedBox(height: AppSizes.spacingSmall),
                ],
              ],
            ),
    );
  }
}

IconData _iconFor(AppPermissionKind kind) => switch (kind) {
      AppPermissionKind.notifications => Icons.notifications_active_outlined,
      AppPermissionKind.battery => Icons.battery_charging_full_outlined,
      AppPermissionKind.autostart => Icons.restart_alt,
      AppPermissionKind.location => Icons.location_on_outlined,
      AppPermissionKind.backgroundLocation => Icons.share_location_outlined,
      AppPermissionKind.camera => Icons.photo_camera_outlined,
      AppPermissionKind.microphone => Icons.mic_none_outlined,
    };

String _titleFor(AppLocalizations l10n, AppPermissionKind kind) => switch (kind) {
      AppPermissionKind.notifications => l10n.permNotificationsTitle,
      AppPermissionKind.battery => l10n.permBatteryTitle,
      AppPermissionKind.autostart => l10n.permAutostartTitle,
      AppPermissionKind.location => l10n.permLocationTitle,
      AppPermissionKind.backgroundLocation => l10n.permBackgroundLocationTitle,
      AppPermissionKind.camera => l10n.permCameraTitle,
      AppPermissionKind.microphone => l10n.permMicrophoneTitle,
    };

String _whyFor(AppLocalizations l10n, AppPermissionKind kind, {required bool isWarehouse}) => switch (kind) {
      AppPermissionKind.notifications =>
        isWarehouse ? l10n.permNotificationsWhyWarehouse : l10n.permNotificationsWhyOther,
      AppPermissionKind.battery => l10n.permBatteryWhy,
      AppPermissionKind.autostart => l10n.permAutostartWhy,
      AppPermissionKind.location => l10n.permLocationWhy,
      AppPermissionKind.backgroundLocation => l10n.permBackgroundLocationWhy,
      AppPermissionKind.camera => l10n.permCameraWhy,
      AppPermissionKind.microphone => l10n.permMicrophoneWhy,
    };

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.why,
    required this.state,
    required this.busy,
    required this.onAction,
    this.steps,
  });

  final IconData icon;
  final String title;
  final String why;
  final String? steps;
  final AppPermissionState state;
  final bool busy;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final granted = state == AppPermissionState.granted;
    final (label, color) = switch (state) {
      AppPermissionState.granted => (l10n.permStateGranted, AppColors.primaryOf(context)),
      AppPermissionState.denied => (l10n.permStateDenied, AppColors.warningOf(context)),
      AppPermissionState.blocked => (l10n.permStateBlocked, AppColors.errorOf(context)),
      AppPermissionState.unknown => (l10n.permStateUnknown, AppColors.textSecondaryOf(context)),
    };
    final action = switch (state) {
      AppPermissionState.granted => null,
      AppPermissionState.blocked => l10n.permActionOpenSettings,
      AppPermissionState.unknown => l10n.permActionOpenPage,
      AppPermissionState.denied => l10n.permActionEnable,
    };
    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon),
              const SizedBox(width: AppSizes.spacingMedium),
              Expanded(child: Text(title, style: context.textTheme.titleSmall)),
              Semantics(
                label: label,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(granted ? Icons.check_circle : Icons.error_outline, size: 18, color: color),
                    const SizedBox(width: 4),
                    Text(label, style: context.textTheme.labelMedium?.copyWith(color: color)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSizes.spacingSmall),
          Text(why, style: context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context))),
          if (steps != null) ...[
            const SizedBox(height: AppSizes.spacingSmall),
            Text(steps!, style: context.textTheme.bodySmall),
          ],
          if (action != null) ...[
            const SizedBox(height: AppSizes.spacingSmall),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: FilledButton.tonal(
                onPressed: busy ? null : onAction,
                child: Text(action),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
