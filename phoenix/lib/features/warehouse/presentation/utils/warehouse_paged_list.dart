import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/failure_widget.dart';

/// The list body every warehouse tab shares: an error with a retry, a
/// spinner or an empty message when there is nothing yet, otherwise the rows
/// with a spinner at the end while the next page loads. Always scrollable,
/// so a pull to refresh works on an empty tab too.
class WarehousePagedList extends StatelessWidget {
  const WarehousePagedList({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    required this.isLoading,
    required this.emptyTitle,
    required this.emptySubtitle,
    required this.emptyIcon,
    this.errorMessage,
    this.onRetry,
    this.isLoadingMore = false,
    this.controller,
    this.header,
  });

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final bool isLoading;
  final String emptyTitle;
  final String emptySubtitle;
  final IconData emptyIcon;
  // Set when the first load failed and there is nothing to show.
  final String? errorMessage;
  final VoidCallback? onRetry;
  final bool isLoadingMore;
  final ScrollController? controller;
  // Shown above the rows (and above the empty/error message).
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    if (itemCount == 0) {
      return ListView(
        controller: controller,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: AppPadding.screen,
        children: [
          ?header,
          const SizedBox(height: AppSizes.spacingLarge),
          if (errorMessage != null)
            FailureWidget(message: errorMessage!, onRetry: onRetry)
          else if (isLoading)
            const Center(child: CircularProgressIndicator())
          else
            EmptyView(message: emptyTitle, subtitle: emptySubtitle, icon: emptyIcon),
        ],
      );
    }
    final offset = header == null ? 0 : 1;
    return ListView.separated(
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: AppPadding.screen,
      itemCount: itemCount + offset + (isLoadingMore ? 1 : 0),
      separatorBuilder: (_, _) => const SizedBox(height: AppSizes.spacingSmall),
      itemBuilder: (context, index) {
        if (offset == 1 && index == 0) return header!;
        final i = index - offset;
        if (i >= itemCount) {
          return const Padding(
            padding: EdgeInsets.all(AppSizes.spacingMedium),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return itemBuilder(context, i);
      },
    );
  }
}

/// Calls [onEnd] when [controller] scrolls near its end - the next page.
void listenForEnd(ScrollController controller, VoidCallback onEnd) {
  controller.addListener(() {
    if (!controller.hasClients) return;
    final position = controller.position;
    if (position.pixels >= position.maxScrollExtent - 240) onEnd();
  });
}

/// A horizontal row of filter chips.
class WarehouseFilterChips<T> extends StatelessWidget {
  const WarehouseFilterChips({
    super.key,
    required this.values,
    required this.selected,
    required this.label,
    required this.onSelected,
  });

  final List<T> values;
  final T selected;
  final String Function(T value) label;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 56,
    child: ListView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: AppSizes.spacingSmall),
      children: [
        for (final value in values)
          Padding(
            padding: const EdgeInsetsDirectional.only(end: AppSizes.spacingSmall),
            child: ChoiceChip(
              label: Text(label(value)),
              selected: selected == value,
              onSelected: (_) => onSelected(value),
            ),
          ),
      ],
    ),
  );
}
