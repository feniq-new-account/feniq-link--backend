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

/// Leave enough scroll range for the last card to clear an extended action.
double roleFabClearance(BuildContext context) => math.max(96, MediaQuery.textScalerOf(context).scale(16) * 1.4 + 48);

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
    this.floatingActionButtonLocation,
  });
  final PreferredSizeWidget appBar;
  final Widget body;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final List<NavigationDestination> destinations;
  final Widget? floatingActionButton;
  final FloatingActionButtonLocation? floatingActionButtonLocation;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, space) {
      final rail = space.maxWidth >= 840 && space.maxHeight >= 480;
      final content = ResponsiveRoleBody(child: body);
      final textStyle =
          Theme.of(context).navigationBarTheme.labelTextStyle?.resolve({WidgetState.selected}) ??
          Theme.of(context).textTheme.labelMedium!;
      var labelHeight = 0.0;
      var labelWidth = 0.0;
      final slotWidth = math.max(24.0, space.maxWidth / destinations.length - 16);
      for (final destination in destinations) {
        final painter = TextPainter(
          text: TextSpan(text: destination.label, style: textStyle),
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout();
        labelWidth = math.max(labelWidth, painter.width);
        painter.layout(maxWidth: slotWidth);
        labelHeight = math.max(labelHeight, painter.height);
        painter.dispose();
      }
      final railWidth = math.max(104.0, labelWidth + 32);
      final compactMenu = labelWidth > slotWidth;
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
                          minWidth: railWidth,
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
                                label: SizedBox(
                                  width: railWidth - 16,
                                  child: Text(d.label, textAlign: TextAlign.center),
                                ),
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
        floatingActionButtonLocation: floatingActionButtonLocation,
        bottomNavigationBar: rail
            ? null
            : compactMenu
            ? _FittedRoleNavigation(destinations: destinations, selectedIndex: selectedIndex, onSelected: onSelected)
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

/// When the labels do not fit at the phone's text size (large text, or five
/// Arabic tabs on a narrow phone), every tab stays on the bar: its icon at full
/// size and its label shrunk to one line, never split and never hidden behind a
/// menu (design review 2026-11-18: tabs must stay visible). TalkBack reads the
/// full label, and each tab is at least 48 points tall.
class _FittedRoleNavigation extends StatelessWidget {
  const _FittedRoleNavigation({required this.destinations, required this.selectedIndex, required this.onSelected});
  final List<NavigationDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelMedium;
    return Material(
      key: const ValueKey('role-tab-bar'),
      color: Theme.of(context).navigationBarTheme.backgroundColor ?? AppColors.surfaceOf(context),
      elevation: 3,
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            for (var i = 0; i < destinations.length; i++)
              Expanded(
                child: Semantics(
                  selected: i == selectedIndex,
                  button: true,
                  label: destinations[i].label,
                  excludeSemantics: true,
                  child: InkWell(
                    onTap: () => onSelected(i),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 64),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 8),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                              decoration: BoxDecoration(
                                color: i == selectedIndex
                                    ? AppColors.primaryOf(context).withValues(alpha: 0.16)
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: i == selectedIndex
                                  ? (destinations[i].selectedIcon ?? destinations[i].icon)
                                  : destinations[i].icon,
                            ),
                            const SizedBox(height: 4),
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Text(
                                destinations[i].label,
                                maxLines: 1,
                                style: style?.copyWith(
                                  fontWeight: i == selectedIndex ? FontWeight.w700 : FontWeight.w500,
                                  color: i == selectedIndex ? AppColors.primaryTextOf(context) : AppColors.textSecondaryOf(context),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
