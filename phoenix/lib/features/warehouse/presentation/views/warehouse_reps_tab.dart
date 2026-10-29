import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:feniq/core/utils/number_input.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/status_badge.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_reps_cubit.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_order_labels.dart';
import 'package:feniq/features/warehouse/presentation/utils/warehouse_paged_list.dart';
import 'package:feniq/routes/route_names.dart';

/// The warehouse's field reps with this month's numbers. Each card's menu
/// changes the commission, switches the rep on/off or sets a new password;
/// the button adds a rep. Assigning pharmacies stays on the panel.
class WarehouseRepsTab extends StatelessWidget {
  const WarehouseRepsTab({super.key});

  static Future<void> addRep(BuildContext context) async {
    final cubit = context.read<WarehouseRepsCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final l10n = context.l10n;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(value: cubit, child: const _AddRepSheet()),
    );
    if (ok == true) messenger.showSnackBar(SnackBar(content: Text(l10n.warehouseRepSaved)));
  }

  Future<void> _editRate(BuildContext context, WarehouseRep rep) async {
    final cubit = context.read<WarehouseRepsCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final l10n = context.l10n;
    final value = await showDialog<String>(
      context: context,
      builder: (_) => _TextDialog(
        title: l10n.warehouseRepEditRate,
        label: l10n.warehouseRepRate,
        hint: '${l10n.warehouseRepQuartersHint}\n${l10n.warehouseRepEditRateHint}',
        initial: warehouseRate(rep.commissionRate),
        number: true,
      ),
    );
    final rate = value == null ? null : double.tryParse(value.replaceAll(',', '.'));
    if (rate == null) return;
    if (await cubit.updateRep(rep.id, commissionRate: rate)) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.warehouseRepSaved)));
    }
  }

  Future<void> _toggleShare(BuildContext context, WarehouseRep rep) async {
    final cubit = context.read<WarehouseRepsCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final l10n = context.l10n;
    final give = !rep.warehouseShareToRep;
    if (await cubit.updateRep(rep.id, warehouseShareToRep: give)) {
      messenger.showSnackBar(
        SnackBar(content: Text(give ? l10n.warehouseRepShareToRepOn : l10n.warehouseRepShareToRepOff)),
      );
    }
  }

  Future<void> _resetPassword(BuildContext context, WarehouseRep rep) async {
    final cubit = context.read<WarehouseRepsCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final l10n = context.l10n;
    final password = await showDialog<String>(
      context: context,
      builder: (_) =>
          _TextDialog(title: l10n.warehouseRepResetPassword, label: l10n.warehouseRepPassword, minLength: 8),
    );
    if (password == null) return;
    if (await cubit.resetPassword(rep.id, password)) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.warehouseRepPasswordReset)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocConsumer<WarehouseRepsCubit, WarehouseRepsState>(
      listenWhen: (a, b) => b.actionErrorCode != null && a.actionErrorCode != b.actionErrorCode,
      listener: (context, state) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(translateErrorCode(l10n, state.actionErrorCode, state.actionErrorMessage ?? ''))),
      ),
      builder: (context, state) => AppRefreshIndicator(
        onRefresh: () => context.read<WarehouseRepsCubit>().load(),
        child: WarehousePagedList(
          bottomClearance: roleFabClearance(context),
          itemCount: state.reps.length,
          isLoading: state.status == RepLoadStatus.initial || state.status == RepLoadStatus.loading,
          errorMessage: state.status == RepLoadStatus.error
              ? translateErrorCode(l10n, state.errorCode, state.errorMessage ?? '')
              : null,
          onRetry: () => context.read<WarehouseRepsCubit>().load(),
          emptyTitle: l10n.warehouseNoRepsTitle,
          emptySubtitle: l10n.warehouseNoRepsSubtitle,
          emptyIcon: Icons.badge_outlined,
          itemBuilder: (context, index) {
            final rep = state.reps[index];
            return _RepCard(
              rep: rep,
              onTap: () =>
                  context.pushNamed(RouteNames.warehouseRep, pathParameters: {'repId': rep.id}, extra: rep.name),
              onEditRate: () => _editRate(context, rep),
              onToggleShare: () => _toggleShare(context, rep),
              onToggle: () => context.read<WarehouseRepsCubit>().updateRep(rep.id, isActive: !rep.isActive),
              onResetPassword: () => _resetPassword(context, rep),
            );
          },
        ),
      ),
    );
  }
}

enum _RepAction { rate, share, toggle, password }

class _RepCard extends StatelessWidget {
  const _RepCard({
    required this.rep,
    required this.onTap,
    required this.onEditRate,
    required this.onToggleShare,
    required this.onToggle,
    required this.onResetPassword,
  });

  final WarehouseRep rep;
  final VoidCallback onTap;
  final VoidCallback onEditRate;
  final VoidCallback onToggleShare;
  final VoidCallback onToggle;
  final VoidCallback onResetPassword;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    return CustomCard(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        rep.name,
                        style: context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: AppSizes.spacingSmall),
                    StatusBadge(label: '${warehouseRate(rep.commissionRate)}%', tone: StatusBadgeTone.info),
                    if (rep.warehouseShareToRep) ...[
                      const SizedBox(width: AppSizes.spacingSmall),
                      StatusBadge(label: l10n.warehouseRepShareGiven, tone: StatusBadgeTone.success),
                    ],
                    if (!rep.isActive) ...[
                      const SizedBox(width: AppSizes.spacingSmall),
                      StatusBadge(label: l10n.warehouseRepInactive, tone: StatusBadgeTone.danger),
                    ],
                  ],
                ),
                Text(rep.phone, textDirection: TextDirection.ltr, style: muted),
                const SizedBox(height: 4),
                Text(l10n.warehouseRepStats(rep.pharmacyCount, rep.visits30d), style: muted),
                Text(
                  l10n.warehouseRepMonth(
                    rep.monthOrdersCount,
                    formatSyp(rep.monthCommission.repAmount, l10n.currencySuffix),
                  ),
                  style: muted,
                ),
              ],
            ),
          ),
          PopupMenuButton<_RepAction>(
            onSelected: (action) => switch (action) {
              _RepAction.rate => onEditRate(),
              _RepAction.share => onToggleShare(),
              _RepAction.toggle => onToggle(),
              _RepAction.password => onResetPassword(),
            },
            itemBuilder: (_) => [
              PopupMenuItem(value: _RepAction.rate, child: Text(l10n.warehouseRepEditRate)),
              CheckedPopupMenuItem(
                value: _RepAction.share,
                checked: rep.warehouseShareToRep,
                child: Text(l10n.warehouseRepShareToRep),
              ),
              PopupMenuItem(
                value: _RepAction.toggle,
                child: Text(rep.isActive ? l10n.warehouseRepDeactivate : l10n.warehouseRepActivate),
              ),
              PopupMenuItem(value: _RepAction.password, child: Text(l10n.warehouseRepResetPassword)),
            ],
          ),
        ],
      ),
    );
  }
}

/// One text field in a dialog; answers with the text, or null on cancel.
class _TextDialog extends StatefulWidget {
  const _TextDialog({
    required this.title,
    required this.label,
    this.hint,
    this.initial,
    this.number = false,
    this.minLength = 1,
  });

  final String title;
  final String label;
  final String? hint;
  final String? initial;
  final bool number;
  final int minLength;

  @override
  State<_TextDialog> createState() => _TextDialogState();
}

class _TextDialogState extends State<_TextDialog> {
  late final TextEditingController _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _valid {
    final text = _controller.text.trim();
    if (text.length < widget.minLength) return false;
    if (widget.number) {
      final value = double.tryParse(text.replaceAll(',', '.'));
      return value != null && value >= 0 && value <= 10;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        keyboardType: widget.number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
        inputFormatters: widget.number ? [const WesternDigitsFormatter(), FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))] : null,
        decoration: InputDecoration(labelText: widget.label, helperText: widget.hint, helperMaxLines: 3),
        onChanged: (_) => setState(() {}),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.cancel)),
        TextButton(
          onPressed: _valid ? () => Navigator.of(context).pop(_controller.text.trim()) : null,
          child: Text(l10n.warehouseSaveEdits),
        ),
      ],
    );
  }
}

class _AddRepSheet extends StatefulWidget {
  const _AddRepSheet();

  @override
  State<_AddRepSheet> createState() => _AddRepSheetState();
}

class _AddRepSheetState extends State<_AddRepSheet> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _rate = TextEditingController(text: '2');
  bool _shareToRep = false;
  bool _showPassword = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _password.dispose();
    _rate.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final navigator = Navigator.of(context);
    final ok = await context.read<WarehouseRepsCubit>().createRep(
      name: _name.text.trim(),
      phone: _phone.text.trim(),
      password: _password.text,
      commissionRate: double.parse(_rate.text.trim().replaceAll(',', '.')),
      warehouseShareToRep: _shareToRep,
    );
    if (ok && navigator.mounted) navigator.pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String? required(String? value) => (value == null || value.trim().isEmpty) ? l10n.warehouseFieldRequired : null;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: AppPadding.screen,
          child: BlocBuilder<WarehouseRepsCubit, WarehouseRepsState>(
            builder: (context, state) => Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(l10n.warehouseAddRep, style: context.textTheme.titleMedium),
                  const SizedBox(height: AppSizes.spacingMedium),
                  TextFormField(
                    controller: _name,
                    autofocus: true,
                    decoration: InputDecoration(labelText: l10n.warehouseRepName),
                    validator: required,
                  ),
                  const SizedBox(height: AppSizes.spacingSmall),
                  TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    textDirection: TextDirection.ltr,
                    inputFormatters: const [WesternDigitsFormatter()],
                    decoration: InputDecoration(labelText: l10n.warehouseRepPhone, hintText: '09XXXXXXXX'),
                    validator: required,
                  ),
                  const SizedBox(height: AppSizes.spacingSmall),
                  TextFormField(
                    controller: _password,
                    obscureText: !_showPassword,
                    decoration: InputDecoration(
                      labelText: l10n.warehouseRepPassword,
                      suffixIcon: IconButton(
                        tooltip: _showPassword ? l10n.hidePassword : l10n.showPassword,
                        onPressed: () => setState(() => _showPassword = !_showPassword),
                        icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
                      ),
                    ),
                    validator: (value) => (value == null || value.length < 8) ? l10n.warehouseRepPassword : null,
                  ),
                  const SizedBox(height: AppSizes.spacingSmall),
                  TextFormField(
                    controller: _rate,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    textDirection: TextDirection.ltr,
                    inputFormatters: [
                      const WesternDigitsFormatter(),
                      FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                    ],
                    decoration: InputDecoration(
                      labelText: l10n.warehouseRepRate,
                      helperText: l10n.warehouseRepQuartersHint,
                      helperMaxLines: 3,
                    ),
                    validator: (value) {
                      final rate = double.tryParse((value ?? '').trim().replaceAll(',', '.'));
                      return rate == null || rate < 0 || rate > 10 ? l10n.errorInvalidCommissionRate : null;
                    },
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(l10n.warehouseRepShareToRep),
                    value: _shareToRep,
                    onChanged: (value) => setState(() => _shareToRep = value),
                  ),
                  if (state.actionErrorCode != null) ...[
                    const SizedBox(height: AppSizes.spacingSmall),
                    Text(
                      translateErrorCode(l10n, state.actionErrorCode, state.actionErrorMessage ?? ''),
                      style: context.textTheme.bodySmall?.copyWith(color: AppColors.errorOf(context)),
                    ),
                  ],
                  const SizedBox(height: AppSizes.spacingMedium),
                  FilledButton(
                    onPressed: state.isSaving ? null : _submit,
                    child: state.isSaving
                        ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(l10n.warehouseAddRep),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
