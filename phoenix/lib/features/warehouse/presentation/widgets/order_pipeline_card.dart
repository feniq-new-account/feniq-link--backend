import 'package:flutter/material.dart';
import 'package:feniq/core/widgets/card_parts.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/features/warehouse/data/repositories/warehouse_management_repository.dart';

/// "Today's orders" for the manager: one bar split by step - waiting for
/// approval, accepted, on the way, delivered today - with each step's count in
/// words beside its colour, and a warning line for orders waiting over 48
/// hours (owner request 2026-11-18). Read-only.
class OrderPipelineCard extends StatefulWidget {
  const OrderPipelineCard({super.key, this.load});

  /// Tests inject a loader; production asks the repository.
  final Future<Map<String, dynamic>> Function()? load;

  @override
  State<OrderPipelineCard> createState() => _OrderPipelineCardState();
}

class _OrderPipelineCardState extends State<OrderPipelineCard> {
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
      final loader = widget.load ?? () => context.read<WarehouseManagementRepository>().getOrderPipeline();
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

  static int _count(Object? step) {
    final value = step is Map ? step['count'] : null;
    return value is num ? value.toInt() : 0;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final data = _data;
    final muted = context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context));
    final steps = data == null
        ? const <(String, int, Color)>[]
        : <(String, int, Color)>[
            // Grey not started, navy accepted, orange on the road, green done:
            // four hues apart, and every one has its label and count in words.
            (l10n.orderPipelinePending, _count(data['pending']), AppColors.textSecondaryOf(context)),
            (l10n.orderPipelineAccepted, _count(data['accepted']), AppColors.navyOf(context)),
            (l10n.orderPipelineOnTheWay, _count(data['onTheWay']), AppColors.primaryOf(context)),
            (l10n.orderPipelineDelivered, _count(data['deliveredToday']), AppColors.secondaryOf(context)),
          ];
    final total = steps.fold<int>(0, (sum, step) => sum + step.$2);
    final stale = data == null
        ? 0
        : (data['stalePendingCount'] is num ? (data['stalePendingCount'] as num).toInt() : 0);

    return CustomCard(
      key: const ValueKey('order-pipeline-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CardHeader(icon: Icons.local_shipping_outlined, title: l10n.orderPipelineTitle, onRefresh: _load),
          const SizedBox(height: AppSizes.spacingSmall),
          if (_failed)
            CardLoadError(message: l10n.orderPipelineFailed, onRetry: _load)
          else if (data == null)
            const LinearProgressIndicator()
          else if (total == 0)
            Text(l10n.orderPipelineNone, style: muted)
          else ...[
            // The bar: one segment per step that has orders, in order.
            ExcludeSemantics(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SizedBox(
                  height: 14,
                  child: Row(
                    children: [
                      for (final (_, count, color) in steps)
                        if (count > 0)
                          Expanded(
                            flex: count,
                            child: ColoredBox(color: color, child: const SizedBox.expand()),
                          ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSizes.spacingSmall),
            for (final (label, count, color) in steps)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    ExcludeSemantics(
                      child: Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
                      ),
                    ),
                    const SizedBox(width: AppSizes.spacingSmall),
                    Expanded(child: Text(label)),
                    Text('$count', style: context.textTheme.titleSmall),
                  ],
                ),
              ),
          ],
          if (stale > 0) ...[
            const SizedBox(height: AppSizes.spacingXSmall),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.schedule, size: 18, color: AppColors.errorOf(context)),
                const SizedBox(width: AppSizes.spacingXSmall),
                Expanded(
                  child: Text(
                    l10n.orderPipelineStale(stale),
                    style: context.textTheme.bodySmall?.copyWith(color: AppColors.errorOf(context)),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
