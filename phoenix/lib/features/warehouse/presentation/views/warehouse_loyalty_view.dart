import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_management_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_loyalty_cubit.dart';

/// The warehouse's loyalty discount: switch it on and set its tiers ("an order
/// of X or more gets Y off").
class WarehouseLoyaltyView extends StatelessWidget {
  const WarehouseLoyaltyView({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: FullText(l10n.warehouseLoyaltyTitle, minScale: 0.6),
      ),
      body: BlocBuilder<WarehouseLoyaltyCubit, WarehouseLoyaltyState>(
        buildWhen: (a, b) => a.status != b.status,
        builder: (context, state) {
          if (state.status == RepLoadStatus.error) {
            return ListView(
              padding: AppPadding.screen,
              children: [
                FailureWidget(
                  message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                  onRetry: () => context.read<WarehouseLoyaltyCubit>().load(),
                ),
              ],
            );
          }
          if (state.status != RepLoadStatus.loaded) return const Center(child: CircularProgressIndicator());
          return _LoyaltyForm(initial: state.loyalty);
        },
      ),
    );
  }
}

class _TierRow {
  _TierRow({String min = '', String discount = ''})
    : min = TextEditingController(text: min),
      discount = TextEditingController(text: discount);

  final TextEditingController min;
  final TextEditingController discount;

  void dispose() {
    min.dispose();
    discount.dispose();
  }
}

/// Digits only, Western or Arabic-Indic, grouping commas and spaces ignored.
int? parseWholeLiras(String text) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  final western = text.split('').map((c) {
    final i = arabic.indexOf(c);
    return i >= 0 ? '$i' : c;
  }).join();
  return int.tryParse(western.replaceAll(RegExp(r'[,،\s]'), ''));
}

class _LoyaltyForm extends StatefulWidget {
  const _LoyaltyForm({required this.initial});

  final WarehouseLoyalty initial;

  @override
  State<_LoyaltyForm> createState() => _LoyaltyFormState();
}

class _LoyaltyFormState extends State<_LoyaltyForm> {
  late bool _enabled = widget.initial.enabled;
  late final List<_TierRow> _rows = [
    for (final tier in widget.initial.tiers) _TierRow(min: '${tier.minSyp}', discount: '${tier.discountSyp}'),
    if (widget.initial.tiers.isEmpty) _TierRow(),
  ];
  String? _error;

  @override
  void dispose() {
    for (final row in _rows) {
      row.dispose();
    }
    super.dispose();
  }

  /// The tiers typed, or null when one is half filled or invalid. Empty rows
  /// are dropped.
  List<LoyaltyTier>? _tiers() {
    final tiers = <LoyaltyTier>[];
    for (final row in _rows) {
      final minText = row.min.text.trim();
      final discountText = row.discount.text.trim();
      if (minText.isEmpty && discountText.isEmpty) continue;
      final min = parseWholeLiras(minText);
      final discount = parseWholeLiras(discountText);
      if (min == null || discount == null || min <= 0 || discount <= 0 || discount >= min) return null;
      tiers.add(LoyaltyTier(minSyp: min, discountSyp: discount));
    }
    return tiers;
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final tiers = _tiers();
    if (tiers == null) {
      setState(() => _error = l10n.warehouseLoyaltyTierError);
      return;
    }
    setState(() => _error = null);
    final ok = await context.read<WarehouseLoyaltyCubit>().save(enabled: _enabled, tiers: tiers);
    if (ok) messenger.showSnackBar(SnackBar(content: Text(l10n.warehouseLoyaltySaved)));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    InputDecoration field(String label) =>
        InputDecoration(labelText: label, suffixText: l10n.currencySuffix, isDense: true);
    final digits = [FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩,،]'))];

    return ListView(
      padding: AppPadding.screen,
      children: [
        CustomCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.warehouseLoyaltyIntro, style: context.textTheme.bodyMedium),
              const SizedBox(height: AppSizes.spacingSmall),
              Text(l10n.warehouseLoyaltyExample, style: muted),
              Material(
                type: MaterialType.transparency,
                child: SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.warehouseLoyaltyEnabled),
                  value: _enabled,
                  onChanged: (value) => setState(() => _enabled = value),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        for (var i = 0; i < _rows.length; i++) ...[
          CustomCard(
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _rows[i].min,
                    keyboardType: TextInputType.number,
                    inputFormatters: digits,
                    decoration: field(l10n.warehouseLoyaltyMin),
                  ),
                ),
                const SizedBox(width: AppSizes.spacingSmall),
                Expanded(
                  child: TextField(
                    controller: _rows[i].discount,
                    keyboardType: TextInputType.number,
                    inputFormatters: digits,
                    decoration: field(l10n.warehouseLoyaltyDiscount),
                  ),
                ),
                IconButton(
                  tooltip: l10n.removeButton,
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => setState(() => _rows.removeAt(i).dispose()),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSizes.spacingSmall),
        ],
        if (_rows.length < 10)
          OutlinedButton.icon(
            onPressed: () => setState(() => _rows.add(_TierRow())),
            icon: const Icon(Icons.add),
            label: Text(l10n.warehouseLoyaltyAddTier),
          ),
        if (_error != null) ...[
          const SizedBox(height: AppSizes.spacingSmall),
          Text(_error!, style: context.textTheme.bodySmall?.copyWith(color: AppColors.errorOf(context))),
        ],
        BlocBuilder<WarehouseLoyaltyCubit, WarehouseLoyaltyState>(
          builder: (context, state) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (state.actionErrorCode != null) ...[
                const SizedBox(height: AppSizes.spacingSmall),
                Text(
                  translateErrorCode(l10n, state.actionErrorCode, state.actionErrorMessage ?? ''),
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.errorOf(context)),
                ),
              ],
              const SizedBox(height: AppSizes.spacingMedium),
              FilledButton(
                onPressed: state.isSaving ? null : _save,
                child: state.isSaving
                    ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(l10n.warehouseLoyaltySave),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
