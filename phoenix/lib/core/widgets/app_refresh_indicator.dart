import 'package:flutter/material.dart';

/// A [RefreshIndicator] that needs a deliberately long pull to fire.
///
/// The stock indicator refreshes after a fairly short drag, so an ordinary
/// scroll back to the top of a list kept triggering a reload. This one feeds
/// the indicator only a fraction of every pull ([dragFactor]), so the finger
/// has to travel 1 / [dragFactor] times as far before it arms.
class AppRefreshIndicator extends StatelessWidget {
  const AppRefreshIndicator({
    super.key,
    required this.onRefresh,
    required this.child,
    this.dragFactor = 0.4,
  });

  final RefreshCallback onRefresh;
  final Widget child;
  final double dragFactor;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: Builder(
        // The scaled copies are dispatched from here, i.e. above the
        // scrollable and right below the indicator, so they reach it at
        // depth 0 exactly like the originals would have.
        builder: (dispatchContext) => NotificationListener<ScrollNotification>(
          onNotification: (notification) {
            if (notification.depth != 0) return false;
            final scaled = _scaled(notification);
            if (scaled == null) return false;
            scaled.dispatch(dispatchContext);
            return true;
          },
          child: child,
        ),
      ),
    );
  }

  // Only the two notifications that carry the pull distance are rescaled;
  // start/end/user-direction ones pass through untouched.
  ScrollNotification? _scaled(ScrollNotification notification) {
    final context = notification.context;
    if (context == null) return null;
    if (notification is OverscrollNotification) {
      return OverscrollNotification(
        metrics: notification.metrics,
        context: context,
        dragDetails: notification.dragDetails,
        overscroll: notification.overscroll * dragFactor,
        velocity: notification.velocity,
      );
    }
    // Bouncing physics (iOS) report the pull as negative scroll positions.
    if (notification is ScrollUpdateNotification &&
        notification.metrics.extentBefore == 0 &&
        notification.metrics.pixels < notification.metrics.minScrollExtent) {
      return ScrollUpdateNotification(
        metrics: notification.metrics,
        context: context,
        dragDetails: notification.dragDetails,
        scrollDelta: (notification.scrollDelta ?? 0) * dragFactor,
        depth: 0,
      );
    }
    return null;
  }
}
