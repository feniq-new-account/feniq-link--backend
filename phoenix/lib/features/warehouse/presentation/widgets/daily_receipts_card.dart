import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';
import 'package:feniq/generated/app_localizations.dart';

/// "Today's receipts" on the accounts tab: the day's net (as in the ledger),
/// what was received by method, and who took what - manager and accountant
/// both record payments. Read-only; the web panel has the full list.
class DailyReceiptsCard extends StatefulWidget {
  const DailyReceiptsCard({super.key, this.load});

  /// Tests inject a loader; production asks the repository.
  final Future<Map<String, dynamic>> Function()? load;

  @override
  State<DailyReceiptsCard> createState() => _DailyReceiptsCardState();
}

class _DailyReceiptsCardState extends State<DailyReceiptsCard> {
  Map<String, dynamic>? _data;
  bool _failed = false;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  Future<void> _load() async {
    final request = ++_generation;
    setState(() => _failed = false);
    try {
      final loader = widget.load ?? () => context.read<WarehouseManagementRepository>().getDailyReceipts();
      final data = await loader();
      if (!mounted || request != _generation) return;
      setState(() => _data = data);
    } catch (_) {
      if (!mounted || request != _generation) return;
      setState(() {
        _data = null;
        _failed = true;
      });
    }
  }

  String _method(AppLocalizations l10n, String method) => switch (method) {
        'cash' => l10n.dailyReceiptsCash,
        'bank_transfer' => l10n.dailyReceiptsTransfer,
        'cheque' => l10n.dailyReceiptsCheque,
        _ => l10n.dailyReceiptsOther,
      };

  String _role(AppLocalizations l10n, String? role) => switch (role) {
        'owner' => l10n.dailyReceiptsRoleOwner,
        'accountant' => l10n.dailyReceiptsRoleAccountant,
        _ => l10n.dailyReceiptsRoleLegacy,
      };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final data = _data;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    num n(Object? v) => v is num ? v : 0;
    String money(Object? v) => formatSyp(n(v), l10n.currencySuffix);

    return CustomCard(
      key: const ValueKey('daily-receipts-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(l10n.dailyReceiptsTitle, style: context.textTheme.titleSmall)),
              IconButton(
                tooltip: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel,
                icon: const Icon(Icons.refresh, size: 20),
                onPressed: _load,
              ),
            ],
          ),
          if (_failed)
            Text(l10n.dailyReceiptsFailed, style: muted)
          else if (data == null)
            const LinearProgressIndicator()
          else if (n(data['receivedCount']) == 0 && n(data['reversedCount']) == 0)
            Text(l10n.dailyReceiptsNone, style: muted)
          else ...[
            Text('${l10n.dailyReceiptsNet}: ${money(data['netSyp'])}',
                style: context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSizes.spacingXSmall),
            Text(l10n.dailyReceiptsReceived(money(data['receivedSyp']), n(data['receivedCount']).toInt()), style: muted),
            if (n(data['reversedCount']) > 0) Text(l10n.dailyReceiptsReversed(money(data['reversedSyp'])), style: muted),
            const SizedBox(height: AppSizes.spacingSmall),
            Wrap(
              spacing: AppSizes.spacingSmall,
              runSpacing: 4,
              children: [
                for (final entry in ((data['byMethod'] as Map?) ?? const {}).entries)
                  Chip(label: Text('${_method(l10n, '${entry.key}')}: ${money(entry.value)}')),
              ],
            ),
            for (final r in ((data['byRecorder'] as List?) ?? const []).whereType<Map>())
              Text('${r['name'] ?? '—'} (${_role(l10n, r['role'] as String?)}): ${money(r['amountSyp'])}'),
          ],
        ],
      ),
    );
  }
}
