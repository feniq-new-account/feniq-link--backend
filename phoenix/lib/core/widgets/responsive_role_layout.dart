import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// Keep text readable rather than shrinking it to keep a fixed column count.
class ResponsiveStatsGrid extends StatelessWidget {
  const ResponsiveStatsGrid({super.key, required this.children, this.minTileWidth = 140, this.maxColumns = 4});
  final List<Widget> children;
  final double minTileWidth;
  final int maxColumns;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      if (children.isEmpty) return const SizedBox.shrink();
      final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
      final columns = ((constraints.maxWidth + 8) / (minTileWidth * math.max(1, scale) + 8))
          .floor()
          .clamp(1, math.min(maxColumns, children.length))
          .toInt();
      return Column(
        children: [
          for (var start = 0; start < children.length; start += columns) ...[
            if (start > 0) const SizedBox(height: 8),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = start; i < math.min(start + columns, children.length); i++) ...[
                    if (i > start) const SizedBox(width: 8),
                    Expanded(child: children[i]),
                  ],
                ],
              ),
            ),
          ],
        ],
      );
    },
  );
}

double roleFilterHeight(BuildContext context) => math.max(64, MediaQuery.textScalerOf(context).scale(13) + 40);

/// Phone, split-screen, landscape and tablet share the same destinations.
/// Wide layouts use a scrollable rail; phone bars grow to fit their labels.
class ResponsiveRoleScaffold extends StatelessWidget {
  const ResponsiveRoleScaffold({
    super.key,
    required this.appBar,
    required this.body,
    required this.selectedIndex,
    required this.onSelected,
    required this.destinations,
    this.floatingActionButton,
  });
  final PreferredSizeWidget appBar;
  final Widget body;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final List<NavigationDestination> destinations;
  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, space) {
      final rail = space.maxWidth >= 840 && space.maxHeight >= 480;
      final content = ResponsiveRoleBody(child: body);
      final textStyle =
          Theme.of(context).navigationBarTheme.labelTextStyle?.resolve({WidgetState.selected}) ??
          Theme.of(context).textTheme.labelMedium!;
      var labelHeight = 0.0;
      for (final destination in destinations) {
        final painter = TextPainter(
          text: TextSpan(text: destination.label, style: textStyle),
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: math.max(24, space.maxWidth / destinations.length - 16));
        labelHeight = math.max(labelHeight, painter.height);
        painter.dispose();
      }
      return Scaffold(
        appBar: appBar,
        body: rail
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  LayoutBuilder(
                    builder: (context, height) => SingleChildScrollView(
                      child: SizedBox(
                        height: math.max(
                          height.maxHeight,
                          destinations.length * (56 + MediaQuery.textScalerOf(context).scale(40)) + 32,
                        ),
                        child: NavigationRail(
                          minWidth: 104,
                          backgroundColor: AppColors.navyOf(context),
                          indicatorColor: Colors.white.withValues(alpha: 0.12),
                          selectedIconTheme: IconThemeData(color: AppColors.primaryOf(context)),
                          unselectedIconTheme: const IconThemeData(color: Color(0xFFB0C0D4)),
                          selectedLabelTextStyle: textStyle.copyWith(color: AppColors.primaryOf(context)),
                          unselectedLabelTextStyle: textStyle.copyWith(color: const Color(0xFFB0C0D4)),
                          selectedIndex: selectedIndex,
                          labelType: NavigationRailLabelType.all,
                          onDestinationSelected: onSelected,
                          destinations: [
                            for (final d in destinations)
                              NavigationRailDestination(
                                icon: d.icon,
                                selectedIcon: d.selectedIcon,
                                label: SizedBox(width: 88, child: Text(d.label, textAlign: TextAlign.center)),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: content),
                ],
              )
            : content,
        floatingActionButton: floatingActionButton,
        bottomNavigationBar: rail
            ? null
            : NavigationBar(
                height: math.max(80, 48 + labelHeight),
                selectedIndex: selectedIndex,
                labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                onDestinationSelected: onSelected,
                destinations: destinations,
              ),
      );
    },
  );
}

/// Keep detail pages comfortable to read on a tablet without shrinking phones.
class ResponsiveRoleBody extends StatelessWidget {
  const ResponsiveRoleBody({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 960), child: child),
  );
}
