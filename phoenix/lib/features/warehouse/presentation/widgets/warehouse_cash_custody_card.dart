import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

typedef CashCustodyLoader = Future<Map<String, dynamic>> Function();

/// Read-only warehouse manager overview of Feniq-held receipts and remittances.
/// The API owns every money amount; pharmacy debt remains in the ledger cards.
/// Financial approvals and transfer confirmation belong to scoped operators.
class WarehouseCashCustodyCard extends StatefulWidget {
  const WarehouseCashCustodyCard({super.key, this.loadCustody});

  /// A test seam; production reads the authenticated warehouse's own data.
  final CashCustodyLoader? loadCustody;

  @override
  State<WarehouseCashCustodyCard> createState() => _WarehouseCashCustodyCardState();
}

class _WarehouseCashCustodyCardState extends State<WarehouseCashCustodyCard> {
  int _generation = 0;
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _payload;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  bool get _arabic => Localizations.localeOf(context).languageCode == 'ar';
  String _tr(String ar, String en) => _arabic ? ar : en;

  Future<void> _load() async {
    final request = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _payload = null; // Fail closed: never retain older financial totals.
    });
    try {
      final loader = widget.loadCustody ??
          () => context.read<WarehouseManagementRepository>().getCashCustody();
      final result = await loader();
      if (!mounted || request != _generation) return;
      final summary = result['summary'];
      if (result['success'] != true ||
          result['writerEnabled'] is! bool ||
          summary is! Map ||
          summary['ready'] is! bool ||
          result['movements'] is! List ||
          result['custody'] is! List ||
          result['receipts'] is! List) {
        throw const FormatException('Incomplete custody response');
      }
      setState(() {
        _payload = result;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || request != _generation) return;
      setState(() {
        _payload = null;
        _loading = false;
        _error = _tr(
          'تعذر تحديث التحصيلات والتحويلات. تم إخفاء الأرقام السابقة.',
          'Unable to refresh collections and transfers. Previous figures are hidden.',
        );
      });
    }
  }

  static int? _amount(Object? raw) {
    if (raw is! num ||
        !raw.isFinite ||
        raw % 1 != 0 ||
        raw.abs() > 9007199254740991) {
      return null;
    }
    return raw.toInt();
  }

  Widget _figure(String label, Object? raw, IconData icon, {bool available = true}) {
    final amount = available ? _amount(raw) : null;
    final value = amount == null
        ? kMoneyUnavailable
        : formatSyp(amount, _tr('ل.س', 'SYP'));
    return SizedBox(
      width: 153,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.surfaceOf(context),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderOf(context)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 18, color: AppColors.textSecondaryOf(context)),
              const SizedBox(height: 7),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 5),
              Text(value, style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.textOf(context),
              )),
            ],
          ),
        ),
      ),
    );
  }

  Widget _notice(String message, {bool warning = false}) {
    final color = warning
        ? AppColors.warningOf(context)
        : AppColors.primaryTextOf(context);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: warning
            ? AppColors.warningSurfaceOf(context)
            : color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(warning ? Icons.warning_amber_outlined : Icons.info_outline,
              size: 19, color: color),
          const SizedBox(width: 9),
          Expanded(child: Text(message, style: Theme.of(context).textTheme.bodySmall)),
        ],
      ),
    );
  }

  String _movementStatus(Map row) {
    final kind = row['kind'];
    return switch (row['status']) {
      'pending' => kind == 'reversal'
          ? _tr('استرجاع بانتظار التأكيد', 'Reversal awaiting confirmation')
          : _tr('بانتظار تأكيد المحاسب', 'Awaiting accountant confirmation'),
      'confirmed' => kind == 'reversal'
          ? _tr('استرجاع مؤكد', 'Confirmed reversal')
          : _tr('تحويل مؤكد', 'Confirmed transfer'),
      'rejected' => _tr('مرفوض', 'Rejected'),
      'reversed' => _tr('تم استرجاع التحويل', 'Transfer reversed'),
      _ => _tr('حالة غير معروفة', 'Unknown status'),
    };
  }

  @override
  Widget build(BuildContext context) {
    final summary = _payload?['summary'] as Map?;
    final ready = summary?['ready'] == true;
    final gross = _amount(summary?['grossCollectedSyp']);
    final movements = _payload?['movements'] as List? ?? const [];
    final custody = _payload?['custody'] as List? ?? const [];
    final receipts = _payload?['receipts'] as List? ?? const [];
    final disabled = _payload?['writerEnabled'] == false;
    final inactive = disabled &&
        gross == 0 && movements.isEmpty && custody.isEmpty && receipts.isEmpty;
    final overdue = custody.where((row) => row is Map && row['overdue'] == true).length;
    final targetMissed = custody.where((row) => row is Map && row['targetMissed'] == true).length;
    final partial = _payload?['custodyTruncated'] == true;
    final latest = movements.whereType<Map>().take(3).toList();
    final sourceTime = DateTime.tryParse(_payload?['asOf']?.toString() ?? '');

    return Card(
      color: AppColors.surfaceElevatedOf(context),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: AppColors.borderOf(context)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.primaryOf(context).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Icon(Icons.account_balance_wallet_outlined,
                    color: AppColors.primaryTextOf(context)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_tr('تحصيلات وتحويلات فينيق', 'Feniq cash and transfers'),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700)),
                  Text(_tr('ملخص رقابي للعرض فقط', 'Read-only overview'),
                    style: Theme.of(context).textTheme.bodySmall),
                ],
              )),
              IconButton(
                tooltip: _tr('تحديث التحويلات', 'Refresh transfers'),
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh),
              ),
            ]),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: LinearProgressIndicator(),
              )
            else if (_error != null) ...[
              _notice(_error!, warning: true),
              TextButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: Text(_tr('إعادة المحاولة', 'Retry')),
              ),
            ]
            else if (inactive)
              _notice(_tr(
                'تحصيل فينيق غير مفعّل لهذا المستودع، ولا توجد تحويلات مسجلة. الذمم أدناه من دفتر الحسابات المعتمد.',
                'Feniq collections are inactive for this warehouse with no recorded transfers. The debts below are from the canonical ledger.',
              ))
            else if (summary != null) ...[
              if (disabled)
                _notice(_tr(
                  'إدخال تحصيلات فينيق الجديدة متوقف حالياً. الأرقام أدناه سجل سابق، وليست موافقة على تشغيل التحصيل.',
                  'New Feniq cash collection is disabled. Figures below are historical, not an activation approval.',
                ), warning: true),
              if (!ready)
                _notice(_tr(
                  'صافي مستحقات المستودع غير متاح لحين اكتمال مطابقة المصادر المالية. لا تعتمد أي مبلغ للتحويل.',
                  'Net amount due to the warehouse is unavailable until source reconciliation passes. Do not rely on any transfer amount.',
                ), warning: true),
              if (gross == 0 && receipts.isEmpty)
                _notice(_tr(
                  'لا توجد تحصيلات نقدية مؤكدة من فينيق حتى الآن.',
                  'No verified Feniq cash receipts are recorded yet.',
                )),
              if (sourceTime != null) ...[
                const SizedBox(height: 8),
                Text(
                  '${_tr('مصدر البيانات', 'Source updated')}: ${sourceTime.toLocal().toString().substring(0, 16)} (${_tr('بتوقيت الجهاز', 'device time')})',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                _figure(_tr('المقبوض نقداً لدى فينيق', 'Verified cash held by Feniq'),
                    summary['grossCollectedSyp'], Icons.payments_outlined),
                _figure(_tr('العمولة الأصلية المستحقة', 'Original earned commission'),
                    summary['originalCommissionSyp'], Icons.receipt_long_outlined,
                    available: ready),
                _figure(_tr('النقد المتبقي بعهدة فينيق', 'Feniq cash still in custody'),
                    summary['cashInCustodySyp'], Icons.inventory_2_outlined),
                _figure(_tr('التحويلات المؤكدة بالصافي', 'Net confirmed transfers'),
                    summary['remittedSyp'], Icons.check_circle_outline),
                _figure(_tr('الصافي المستحق للمستودع', 'Net due to warehouse'),
                    summary['netWarehouseDueSyp'], Icons.account_balance_outlined,
                    available: ready),
              ]),
              const SizedBox(height: 8),
              Text(_tr(
                'الصافي يستبعد التحويلات المؤكدة فقط؛ الحوالة المعلقة لا تُحسب مسددة. النقد بالعهدة يخص هذا المسار فقط وليس رصيد الخزينة الكلي أو ذمم الصيدليات.',
                'Net due subtracts confirmed transfers only; pending transfers are not paid. Cash in custody covers this flow only, not total treasury cash or pharmacy debt.',
              ), style: Theme.of(context).textTheme.bodySmall),
              if (custody.isNotEmpty) ...[
                const Divider(height: 26),
                Text(_tr('متابعة مهلة تحويل المقبوضات', 'Cash remittance deadlines'),
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(_tr(
                  'تجاوز هدف 24 ساعة: ${partial ? '≥' : ''}$targetMissed  •  تجاوز الحد الأقصى 48 ساعة: ${partial ? '≥' : ''}$overdue',
                  'Past 24h target: ${partial ? '≥' : ''}$targetMissed  •  Past 48h limit: ${partial ? '≥' : ''}$overdue',
                )),
                if (partial)
                  Text(_tr('هذه أعداد من الصفحة المتاحة فقط.', 'Counts cover only the loaded page.'),
                    style: Theme.of(context).textTheme.bodySmall),
              ],
              if (latest.isNotEmpty) ...[
                const Divider(height: 26),
                Text(_tr('آخر الحوالات', 'Recent transfers'),
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                for (final row in latest)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      children: [
                        Expanded(child: Text(_movementStatus(row))),
                        const SizedBox(width: 8),
                        Text(
                          _amount(row['amountSyp']) == null
                              ? kMoneyUnavailable
                              : formatSyp(_amount(row['amountSyp'])!, _tr('ل.س', 'SYP')),
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
              ],
              const SizedBox(height: 10),
              Text(_tr(
                'تسجيل التحصيلات وتأكيد استلام الحوالات يتمان بصلاحيات مالية مستقلة من لوحة المحاسبة.',
                'Cash collection and remittance confirmation require separate finance permissions in the accountant dashboard.',
              ), style: Theme.of(context).textTheme.bodySmall),
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
