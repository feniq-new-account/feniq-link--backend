import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/utils/number_input.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/core/widgets/responsive_role_layout.dart';
import 'package:feniq/core/widgets/whatsapp_button.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/warehouse/data/models/warehouse_insights_models.dart';
import 'package:feniq/features/warehouse/presentation/managers/warehouse_insights_cubit.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/generated/app_localizations.dart';

String _tabLabel(AppLocalizations l10n, String tab) => switch (tab) {
  'overdue' => l10n.warehouseInsightsOverdue,
  'inactive' => l10n.warehouseInsightsInactive,
  'alerts' => l10n.warehouseInsightsAlerts,
  _ => l10n.warehouseInsightsOverview,
};

class WarehouseInsightsView extends StatelessWidget {
  const WarehouseInsightsView({super.key});
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<WarehouseInsightsCubit>();
    return Scaffold(
      appBar: AppBar(
        title: Text(
          l10n.warehouseInsightsTitle,
          softWrap: true,
          maxLines: 2,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(color: Colors.white),
        ),
        toolbarHeight: math.max(
          64,
          MediaQuery.textScalerOf(context).scale(18) * 2.8 + 12,
        ),
        actions: [
          IconButton(
            tooltip: l10n.warehouseInsightsRefresh,
            icon: const Icon(Icons.refresh),
            onPressed: cubit.loadAccess,
          ),
        ],
      ),
      body: ResponsiveRoleBody(
        child: RefreshIndicator(
          onRefresh: cubit.loadAccess,
          child: BlocBuilder<WarehouseInsightsCubit, WarehouseInsightsState>(
            builder: (context, state) {
              return ListView(
                padding: AppPadding.screen,
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  if (state.tab == 'overview')
                    Text(
                      l10n.warehouseInsightsScopeShort,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final tab in state.tabs)
                        ChoiceChip(
                          label: Text(_tabLabel(l10n, tab)),
                          selected: state.tab == tab,
                          onSelected: state.saving
                              ? null
                              : (_) => cubit.setTab(tab),
                        ),
                    ],
                  ),
                  if (state.tab == 'overview' &&
                      state.tabs.contains('overview')) ...[
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final period in ['today', 'week', 'month'])
                          ChoiceChip(
                            selected: state.period == period,
                            label: Text(switch (period) {
                              'today' => l10n.warehouseSummaryToday,
                              'week' => l10n.warehouseSummaryWeek,
                              _ => l10n.warehouseSummaryMonth,
                            }),
                            onSelected: (_) => cubit.setPeriod(period),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),
                  if (state.status == RepLoadStatus.loading ||
                      state.status == RepLoadStatus.initial)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  if (state.status == RepLoadStatus.error) ...[
                    Text(
                      translateErrorCode(
                        l10n,
                        state.errorCode,
                        state.errorMessage ?? l10n.errorState,
                      ),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                    TextButton(
                      onPressed: cubit.loadAccess,
                      child: Text(l10n.retryButton),
                    ),
                  ],
                  if (state.status == RepLoadStatus.loaded &&
                      state.tabs.isEmpty)
                    Text(l10n.warehouseInsightsInactiveFeature),
                  if (state.asOfBusiness.isNotEmpty)
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        Text(
                          l10n.warehouseInsightsAsOf,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        Text(
                          state.asOfBusiness,
                          textDirection: TextDirection.ltr,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        Text(
                          l10n.warehouseInsightsDamascus,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  if (state.report != null) ...[
                    const SizedBox(height: 12),
                    _ReportFigures(report: state.report!),
                  ],
                  if (state.followUp != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      l10n.warehouseInsightsResults('${state.followUp!.total}'),
                    ),
                    if (state.followUp!.rows.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 20),
                        child: Text(l10n.warehouseInsightsEmpty),
                      ),
                    for (final row in state.followUp!.rows)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: _FollowUpCard(
                          row: row,
                          overdue: state.tab == 'overdue',
                        ),
                      ),
                    if (state.followUp!.hasMore)
                      TextButton(
                        onPressed: state.loadingMore ? null : cubit.loadMore,
                        child: state.loadingMore
                            ? const CircularProgressIndicator()
                            : Text(l10n.warehouseInsightsLoadMore),
                      ),
                    const SizedBox(height: 16),
                    _ThresholdForm(
                      key: ValueKey(state.followUp!.settings.revision),
                      settings: state.followUp!.settings,
                      saving: state.saving,
                    ),
                  ],
                  if (state.tab == 'alerts' &&
                      state.status == RepLoadStatus.loaded) ...[
                    if (state.alerts.isEmpty)
                      Text(l10n.warehouseInsightsNoAlerts),
                    for (final alert in state.alerts)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: CustomCard(
                          onTap: () {
                            if (['overdue', 'inactive'].contains(alert.code)) {
                              cubit.setTab(alert.code);
                            } else {
                              if (context.canPop()) {
                                GoRouter.of(context).pop(
                                  alert.code == 'returns_pending'
                                      ? 'returns'
                                      : 'orders',
                                );
                              } else {
                                context.goNamed(
                                  RouteNames.warehouseHome,
                                  queryParameters: {
                                    'tab': alert.code == 'returns_pending'
                                        ? 'returns'
                                        : 'orders',
                                  },
                                );
                              }
                            }
                          },
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(switch (alert.code) {
                                'overdue' => l10n.warehouseInsightsAlertOverdue(
                                  '${alert.count}',
                                ),
                                'inactive' =>
                                  l10n.warehouseInsightsAlertInactive(
                                    '${alert.count}',
                                  ),
                                'returns_pending' =>
                                  l10n.warehouseInsightsAlertReturns(
                                    '${alert.count}',
                                  ),
                                'orders_pending' =>
                                  l10n.warehouseInsightsAlertOrders(
                                    '${alert.count}',
                                  ),
                                _ => l10n.warehouseInsightsAlerts,
                              }),
                              if (alert.amountSyp > 0)
                                Text(
                                  formatSyp(
                                    alert.amountSyp,
                                    l10n.currencySuffix,
                                  ),
                                  textDirection: TextDirection.ltr,
                                ),
                            ],
                          ),
                        ),
                      ),
                  ],
                  if (state.actionErrorMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        translateErrorCode(
                          l10n,
                          state.actionErrorCode,
                          state.actionErrorMessage!,
                        ),
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ReportFigures extends StatelessWidget {
  const _ReportFigures({required this.report});
  final WarehouseInsightsReport report;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final values = [
      (l10n.warehouseInsightsNetSales, report.netSalesSyp),
      (l10n.warehouseInsightsCollections, report.collectionsSyp),
      (l10n.warehouseInsightsReturns, report.returnsSyp),
      (l10n.warehouseInsightsDebts, report.debtSyp),
    ];
    final style = Theme.of(
      context,
    ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700);
    var minimum = 140.0;
    for (final value in values) {
      final measure = TextPainter(
        text: TextSpan(
          text: formatSyp(value.$2, l10n.currencySuffix),
          style: style,
        ),
        textDirection: TextDirection.ltr,
        textScaler: MediaQuery.textScalerOf(context),
      )..layout();
      minimum = math.max(minimum, measure.width + 40);
    }
    final maxAging = report.aging.fold<int>(1, math.max);
    final bounds = [
      0,
      report.settings.overdueDays,
      report.settings.overdueDays * 2,
      report.settings.overdueDays * 4,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ResponsiveStatsGrid(
          minTileWidth: minimum,
          children: [
            for (final value in values)
              CustomCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(value.$1),
                    const SizedBox(height: 8),
                    Directionality(
                      textDirection: TextDirection.ltr,
                      child: FitLabel(
                        formatSyp(value.$2, l10n.currencySuffix),
                        style: style,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        _TrendCard(daily: report.daily),
        const SizedBox(height: 16),
        CustomCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.warehouseInsightsAging,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.warehouseInsightsAgingMethod,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (report.unknownAgeSyp > 0) ...[
                const SizedBox(height: 12),
                Text(l10n.warehouseInsightsUnknownAge),
                Text(
                  formatSyp(report.unknownAgeSyp, l10n.currencySuffix),
                  textDirection: TextDirection.ltr,
                ),
              ],
              for (var i = 0; i < 4; i++) ...[
                const SizedBox(height: 14),
                Text(
                  '${i == 3 ? '${bounds[i]}+' : '${bounds[i]}–${bounds[i + 1] - 1}'}: ${formatSyp(report.aging[i], l10n.currencySuffix)}',
                  textDirection: TextDirection.ltr,
                ),
                const SizedBox(height: 6),
                LinearProgressIndicator(
                  value: report.aging[i] / maxAging,
                  minHeight: 10,
                  backgroundColor: AppColors.borderOf(context),
                  borderRadius: BorderRadius.circular(6),
                  color: i == 3
                      ? AppColors.warningOf(context)
                      : AppColors.secondaryOf(context),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        CustomCard(
          child: ExpansionTile(
            tilePadding: EdgeInsets.zero,
            childrenPadding: EdgeInsets.zero,
            title: Text(l10n.warehouseInsightsDailyTable),
            children: [
              for (final day in report.daily)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(day.date, textDirection: TextDirection.ltr),
                      Text(
                        '${l10n.warehouseInsightsNetSales}: ${formatSyp(day.netSalesSyp, l10n.currencySuffix)}',
                      ),
                      Text(
                        '${l10n.warehouseInsightsCollections}: ${formatSyp(day.collectionsSyp, l10n.currencySuffix)}',
                      ),
                      Text(
                        '${l10n.warehouseInsightsReturns}: ${formatSyp(day.returnsSyp, l10n.currencySuffix)}',
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        CustomCard(
          child: ExpansionTile(
            title: Text(l10n.warehouseInsightsAbout),
            tilePadding: EdgeInsets.zero,
            children: [
              Text(
                l10n.warehouseInsightsScope,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TrendCard extends StatefulWidget {
  const _TrendCard({required this.daily});
  final List<DailyWarehouseMovement> daily;
  @override
  State<_TrendCard> createState() => _TrendCardState();
}

class _TrendCardState extends State<_TrendCard> {
  int? _selected;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (widget.daily.isEmpty) return const SizedBox.shrink();
    final index = math.min(
      _selected ?? widget.daily.length - 1,
      widget.daily.length - 1,
    );
    final day = widget.daily[index];
    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.warehouseInsightsTrend,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              Text(
                '● ${l10n.warehouseInsightsNetSales}',
                style: TextStyle(color: AppColors.secondaryOf(context)),
              ),
              Text(
                '● ${l10n.warehouseInsightsCollections}',
                style: TextStyle(color: AppColors.primaryOf(context)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Semantics(
            image: true,
            label: l10n.warehouseInsightsTrend,
            child: SizedBox(
              height: 180,
              child: CustomPaint(
                painter: _TrendPainter(
                  widget.daily,
                  index,
                  AppColors.borderOf(context),
                  AppColors.primaryOf(context),
                  AppColors.secondaryOf(context),
                ),
              ),
            ),
          ),
          Text(
            l10n.warehouseInsightsInspectDay,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          Directionality(
            textDirection: TextDirection.ltr,
            child: Slider(
              value: index.toDouble(),
              min: 0,
              max: math.max(1, widget.daily.length - 1).toDouble(),
              divisions: widget.daily.length > 1
                  ? widget.daily.length - 1
                  : null,
              semanticFormatterCallback: (value) => widget
                  .daily[value.round().clamp(0, widget.daily.length - 1)]
                  .date,
              onChanged: widget.daily.length > 1
                  ? (value) => setState(() => _selected = value.round())
                  : null,
            ),
          ),
          Text(
            day.date,
            textDirection: TextDirection.ltr,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          Text(
            '${l10n.warehouseInsightsNetSales}: ${formatSyp(day.netSalesSyp, l10n.currencySuffix)}',
          ),
          Text(
            '${l10n.warehouseInsightsCollections}: ${formatSyp(day.collectionsSyp, l10n.currencySuffix)}',
          ),
        ],
      ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(
    this.rows,
    this.selected,
    this.grid,
    this.collections,
    this.sales,
  );
  final List<DailyWarehouseMovement> rows;
  final int selected;
  final Color grid, collections, sales;
  @override
  void paint(Canvas canvas, Size size) {
    final values = rows.expand((row) => [row.netSalesSyp, row.collectionsSyp]);
    final low = math.min(0, values.reduce(math.min)),
        high = math.max(1, values.reduce(math.max));
    double x(int i) => rows.length == 1
        ? size.width / 2
        : 8 + i / (rows.length - 1) * (size.width - 16);
    double y(int value) =>
        size.height - 8 - (value - low) / (high - low) * (size.height - 16);
    final gridPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (final position in [8.0, size.height / 2, size.height - 8]) {
      canvas.drawLine(
        Offset(0, position),
        Offset(size.width, position),
        gridPaint,
      );
    }
    for (final series in [true, false]) {
      final color = series ? sales : collections;
      final path = Path();
      for (var i = 0; i < rows.length; i++) {
        final point = Offset(
          x(i),
          y(series ? rows[i].netSalesSyp : rows[i].collectionsSyp),
        );
        if (i == 0) {
          path.moveTo(point.dx, point.dy);
        } else {
          path.lineTo(point.dx, point.dy);
        }
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5,
      );
      canvas.drawCircle(
        Offset(
          x(selected),
          y(
            series ? rows[selected].netSalesSyp : rows[selected].collectionsSyp,
          ),
        ),
        5,
        Paint()..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _TrendPainter old) =>
      old.rows != rows ||
      old.selected != selected ||
      old.grid != grid ||
      old.collections != collections ||
      old.sales != sales;
}

class _FollowUpCard extends StatelessWidget {
  const _FollowUpCard({required this.row, required this.overdue});
  final WarehouseFollowUpRow row;
  final bool overdue;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            englishFirst(row.nameEn, row.nameAr),
            style: Theme.of(context).textTheme.titleSmall,
          ),
          if (row.city.isNotEmpty) Text(row.city),
          Text('${l10n.warehouseInsightsDays}: ${row.days}'),
          if (overdue)
            Text(
              formatSyp(row.overdueSyp, l10n.currencySuffix),
              textDirection: TextDirection.ltr,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          if (!overdue && row.lastOrderAt == null)
            Text(
              l10n.warehouseInsightsNoPreviousOrder,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () async {
                    await context.pushNamed(
                      RouteNames.warehouseAccount,
                      pathParameters: {'pharmacyId': row.pharmacyId},
                    );
                    if (context.mounted) {
                      await context.read<WarehouseInsightsCubit>().load(
                        force: true,
                      );
                    }
                  },
                  child: Text(
                    l10n.warehouseInsightsOpenStatement,
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
              if (row.phone?.isNotEmpty == true) ...[
                const SizedBox(width: 8),
                WhatsAppButton(phone: row.phone!, size: 48),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _ThresholdForm extends StatefulWidget {
  const _ThresholdForm({
    super.key,
    required this.settings,
    required this.saving,
  });
  final FollowUpSettings settings;
  final bool saving;
  @override
  State<_ThresholdForm> createState() => _ThresholdFormState();
}

class _ThresholdFormState extends State<_ThresholdForm> {
  late final overdue = TextEditingController(
    text: '${widget.settings.overdueDays}',
  );
  late final inactive = TextEditingController(
    text: '${widget.settings.inactiveDays}',
  );
  String? error;
  @override
  void dispose() {
    overdue.dispose();
    inactive.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final debtDays = int.tryParse(overdue.text),
        inactiveDays = int.tryParse(inactive.text);
    if (debtDays == null ||
        inactiveDays == null ||
        debtDays < 1 ||
        debtDays > 180 ||
        inactiveDays < 1 ||
        inactiveDays > 180) {
      setState(() => error = context.l10n.warehouseInsightsInvalidDays);
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    final message = context.l10n.warehouseInsightsSaved;
    final saved = await context.read<WarehouseInsightsCubit>().saveSettings(
      FollowUpSettings(
        overdueDays: debtDays,
        inactiveDays: inactiveDays,
        revision: widget.settings.revision,
      ),
    );
    if (saved) messenger.showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return CustomCard(
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: Text(l10n.warehouseInsightsSettings),
        children: [
          for (final field in [
            (l10n.warehouseInsightsOverdueDays, overdue),
            (l10n.warehouseInsightsInactiveDays, inactive),
          ]) ...[
            Text(field.$1),
            const SizedBox(height: 8),
            Semantics(
              label: field.$1,
              child: TextField(
                controller: field.$2,
                enabled: !widget.saving,
                keyboardType: TextInputType.number,
                textDirection: TextDirection.ltr,
                inputFormatters: const [WesternDigitsFormatter()],
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (error != null)
            Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          FilledButton(
            onPressed: widget.saving ? null : save,
            child: Text(l10n.warehouseInsightsSaveSettings),
          ),
        ],
      ),
    );
  }
}
