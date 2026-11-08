import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

typedef CollectionJournalLoader = Future<Map<String, dynamic>> Function(String period);

/// Warehouse manager's collection-v2 read model. This widget never posts money,
/// never computes commission locally and never treats absent source data as zero.
/// The existing ledger account list below it remains the source of pharmacy debt.
class WarehouseCollectionAccountingCard extends StatefulWidget {
  const WarehouseCollectionAccountingCard({super.key, this.loadJournal});

  /// Test seam; production always uses the current warehouse's scoped API.
  final CollectionJournalLoader? loadJournal;

  @override
  State<WarehouseCollectionAccountingCard> createState() =>
      _WarehouseCollectionAccountingCardState();
}

class _WarehouseCollectionAccountingCardState
    extends State<WarehouseCollectionAccountingCard> {
  static const _periods = ['today', 'week', 'month'];
  int _generation = 0;
  String _period = 'month';
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _journal;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  bool get _arabic => Localizations.localeOf(context).languageCode == 'ar';
  String _tr(String ar, String en) => _arabic ? ar : en;

  Future<void> _load({String? period}) async {
    final request = ++_generation;
    final selectedPeriod = period ?? _period;
    setState(() {
      _period = selectedPeriod;
      _loading = true;
      _error = null;
      _journal = null; // Never show a previous period/account after a failed read.
    });
    try {
      final loader = widget.loadJournal ??
          (value) => context
              .read<WarehouseManagementRepository>()
              .getCollectionAccounting(period: value);
      final result = await loader(selectedPeriod);
      if (!mounted || request != _generation) return;
      if (result['success'] != true || !result.containsKey('summary')) {
        throw const FormatException('Incomplete collection journal');
      }
      final summary = result['summary'];
      if (summary != null &&
          (summary is! Map || summary['model'] != 'collection_v2')) {
        throw const FormatException('Invalid commission engine');
      }
      setState(() {
        _journal = result;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || request != _generation) return;
      setState(() {
        _journal = null;
        _error = _tr(
          'تعذر قراءة محاسبة التحصيل من السيرفر. لا تُعتمد الأرقام السابقة.',
          'Could not load the server collection journal. Previous figures are not shown.',
        );
        _loading = false;
      });
    }
  }

  static num? _safeMoney(Object? value) {
    if (value is! num ||
        !value.isFinite ||
        value % 1 != 0 ||
        value.abs() > 9007199254740991) {
      return null;
    }
    return value;
  }

  Widget _figure(String label, Object? value, String suffix) {
    final amount = _safeMoney(value);
    return SizedBox(
      width: 150,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          Text(
            amount == null ? kMoneyUnavailable : formatSyp(amount, suffix),
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _invoiceStatus(Map<dynamic, dynamic> states, String key,
      String ar, String en) {
    final raw = states[key];
    final count = raw is int && raw >= 0 ? raw.toString() : '—';
    return Text('${_tr(ar, en)}: $count');
  }

  @override
  Widget build(BuildContext context) {
    final suffix = _tr('ل.س', 'SYP');
    final summary = _journal?['summary'];
    final v2 = summary is Map && summary['model'] == 'collection_v2';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.account_balance_outlined),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _tr('محاسبة التحصيل الجديدة', 'Collection accounting'),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: _tr('تحديث الأرقام', 'Refresh figures'),
                  icon: const Icon(Icons.refresh),
                  onPressed: _loading ? null : () => _load(),
                ),
              ],
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: LinearProgressIndicator(),
              )
            else if (_error != null)
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))
            else if (!v2)
              Text(
                _tr(
                  'نظام عمولات التحصيل غير مفعّل لهذا المستودع. الأرصدة أدناه هي من دفتر الذمم الحالي، وليست عمولات تحصيل جديدة.',
                  'Collection commission is not active for this warehouse. The account balances below come from the existing ledger, not new earned commissions.',
                ),
              )
            else ...[
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final period in _periods)
                    ChoiceChip(
                      label: Text(switch (period) {
                        'today' => _tr('اليوم', 'Today'),
                        'week' => _tr('الأسبوع', 'Week'),
                        _ => _tr('الشهر', 'Month'),
                      }),
                      selected: _period == period,
                      onSelected: _loading ? null : (_) => _load(period: period),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _tr(
                  'العمولات المثبتة خلال الفترة المختارة (وليست عمولات الطلبات غير المحصّلة)',
                  'Posted commissions in the selected period (not commissions on unpaid orders)',
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 16,
                runSpacing: 12,
                children: [
                  _figure(_tr('إجمالي العمولة', 'Total commission'),
                      summary['originalSyp'], suffix),
                  _figure(_tr('حصة فينيق', 'Feniq share'),
                      summary['feniqSyp'], suffix),
                  _figure(_tr('حصة المندوب', 'Rep share'),
                      summary['repSyp'], suffix),
                  _figure(_tr('تصحيحات حصة فينيق', 'Feniq corrections'),
                      summary['correctionsFeniqSyp'], suffix),
                ],
              ),
              const Divider(height: 28),
              Text(
                _tr('الأرصدة الحالية لجميع الفترات', 'Current balances across all periods'),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 16,
                runSpacing: 12,
                children: [
                  _figure(_tr('رصيد المرتجعات المتاح', 'Available return credit'),
                      summary['returnCreditAvailableSyp'], suffix),
                  _figure(_tr('التزام رصيد المرتجعات', 'Return credit liability'),
                      summary['returnCreditLiabilitySyp'], suffix),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                _tr('حالات الفواتير حالياً', 'Current invoice states'),
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 6),
              if (summary['invoiceStates'] is Map)
                Wrap(
                  spacing: 16,
                  runSpacing: 8,
                  children: [
                    _invoiceStatus(summary['invoiceStates'], 'open', 'مفتوحة', 'Open'),
                    _invoiceStatus(summary['invoiceStates'], 'partial', 'جزئية', 'Partial'),
                    _invoiceStatus(summary['invoiceStates'], 'paid', 'مسددة', 'Paid'),
                    _invoiceStatus(summary['invoiceStates'], 'void', 'ملغاة', 'Void'),
                  ],
                )
              else
                const Text('—'),
              const SizedBox(height: 8),
              Text(
                _tr(
                  'تفاصيل الفواتير والقيود وسندات القبض موجودة في لوحة المحاسب. لا يمكن تسجيل دفعة من هذا الملخص.',
                  'Invoices, journal events and receipt evidence are available in the accountant dashboard. This summary cannot post payments.',
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    ++_generation;
    super.dispose();
  }
}
