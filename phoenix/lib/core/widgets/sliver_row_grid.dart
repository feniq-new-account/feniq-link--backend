import 'package:flutter/material.dart';

/// A grid whose rows are as tall as their content, instead of one fixed cell
/// height. A card with a long name wraps it onto more lines and its row grows
/// to fit - nothing is ever cut off - while the cards of one row share the
/// tallest one's height so the row still lines up. The column count is fluid,
/// one column per [maxCrossAxisExtent] (as SliverGridDelegateWithMaxCrossAxisExtent).
///
/// Cards inside are measured with IntrinsicHeight, so they must not contain a
/// LayoutBuilder (use FitLabel rather than FullText inside them).
class SliverRowGrid extends StatelessWidget {
  const SliverRowGrid({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    required this.maxCrossAxisExtent,
    this.mainAxisSpacing = 0,
    this.crossAxisSpacing = 0,
    this.minRowHeight = 0,
  });

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final double maxCrossAxisExtent;
  final double mainAxisSpacing;
  final double crossAxisSpacing;
  // Rows are never shorter than this: a card with a short name keeps the
  // height it was designed at.
  final double minRowHeight;

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(
      builder: (context, constraints) {
        final columns =
            ((constraints.crossAxisExtent + crossAxisSpacing) / (maxCrossAxisExtent + crossAxisSpacing)).ceil().clamp(1, 12);
        final rows = (itemCount / columns).ceil();
        return SliverList(
          delegate: SliverChildBuilderDelegate((context, row) {
            final start = row * columns;
            return Padding(
              padding: EdgeInsets.only(bottom: row == rows - 1 ? 0 : mainAxisSpacing),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: minRowHeight),
                child: IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (var i = 0; i < columns; i++) ...[
                        if (i > 0) SizedBox(width: crossAxisSpacing),
                        Expanded(
                          child: start + i < itemCount ? itemBuilder(context, start + i) : const SizedBox.shrink(),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            );
          }, childCount: rows),
        );
      },
    );
  }
}
