import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/features/cart/data/models/order_model.dart';
import 'package:feniq/features/cart/presentation/utils/order_status_label.dart';

// Section 6.7: a horizontal progress bar across the order's stages (four, or
// five when the warehouse edited it), with an animated icon marking the
// current one - 'cancelled' never reaches this widget at all
// (OrderTrackingView shows a distinct cancelled state instead).
class OrderProgressBar extends StatefulWidget {
  const OrderProgressBar({super.key, required this.stages, required this.currentStageIndex});

  final List<OrderStage> stages;
  final int currentStageIndex;

  // Exposed so OrderTrackingView can show the same icon on its "current
  // status" highlight card.
  static IconData iconFor(OrderStage stage) => switch (stage) {
    OrderStage.sent => Icons.send_outlined,
    OrderStage.modified => Icons.edit_note_outlined,
    OrderStage.accepted => Icons.thumb_up_alt_outlined,
    OrderStage.outForDelivery => Icons.local_shipping_outlined,
    OrderStage.delivered => Icons.check_circle_outline,
  };

  @override
  State<OrderProgressBar> createState() => _OrderProgressBarState();
}

class _OrderProgressBarState extends State<OrderProgressBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final labels = [for (final stage in widget.stages) orderStageLabel(l10n, stage)];
    final progress = widget.currentStageIndex / (labels.length - 1);

    return LayoutBuilder(
      builder: (context, constraints) {
        const dotSize = 32.0;
        final trackWidth = constraints.maxWidth - dotSize;

        return Column(
          children: [
            SizedBox(
              height: dotSize,
              child: Stack(
                alignment: AlignmentDirectional.centerStart,
                children: [
                  Positioned(
                    left: dotSize / 2,
                    right: dotSize / 2,
                    child: Container(height: 3, color: AppColors.borderOf(context)),
                  ),
                  // PositionedDirectional, not Positioned: the dots below
                  // (a plain Row) already mirror automatically in RTL, so
                  // this fill has to grow from the same "start" edge (right
                  // in Arabic) or it visually fills toward the wrong,
                  // not-yet-completed stages.
                  PositionedDirectional(
                    start: dotSize / 2,
                    child: Container(
                      width: trackWidth * progress,
                      height: 3,
                      color: AppColors.secondaryOf(context),
                    ),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: List.generate(labels.length, (index) {
                      final isCompleted = index < widget.currentStageIndex;
                      final isCurrent = index == widget.currentStageIndex;

                      final dot = _StageDot(
                        icon: OrderProgressBar.iconFor(widget.stages[index]),
                        completed: isCompleted,
                        current: isCurrent,
                      );

                      if (!isCurrent) return dot;

                      return ScaleTransition(
                        scale: Tween(begin: 0.88, end: 1.12).animate(
                          CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
                        ),
                        child: dot,
                      );
                    }),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: List.generate(
                labels.length,
                (index) => Expanded(
                  child: Text(
                    labels[index],
                    textAlign: TextAlign.center,
                    style: context.textTheme.bodyMedium?.copyWith(
                      fontSize: 12,
                      fontWeight: index == widget.currentStageIndex
                          ? FontWeight.bold
                          : FontWeight.normal,
                      color: index <= widget.currentStageIndex
                          ? AppColors.textOf(context)
                          : AppColors.textSecondaryOf(context),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _StageDot extends StatelessWidget {
  const _StageDot({required this.icon, required this.completed, required this.current});

  final IconData icon;
  final bool completed;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final Color backgroundColor;
    final Color iconColor;
    if (completed) {
      backgroundColor = AppColors.secondaryOf(context);
      iconColor = Colors.white;
    } else if (current) {
      backgroundColor = AppColors.primaryOf(context);
      iconColor = AppColors.onPrimaryOf(context);
    } else {
      backgroundColor = AppColors.surfaceOf(context);
      iconColor = AppColors.textSecondaryOf(context);
    }

    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: backgroundColor,
        shape: BoxShape.circle,
        border: completed || current
            ? null
            : Border.all(color: AppColors.borderOf(context)),
      ),
      child: Icon(completed ? Icons.check : icon, size: 16, color: iconColor),
    );
  }
}
