import 'package:flutter/material.dart';

/// Keeps every screen, bottom sheet and dialog clear of the phone's own
/// navigation buttons (back / home / recents). Android 15 draws apps
/// edge-to-edge, beneath those buttons, so without this a bottom sheet's
/// button or the end of a list could sit under them - the owner saw the
/// quantity sheet's "Add" covered. Applied once, around the whole navigator;
/// the strip behind the buttons takes the app's background colour.
///
/// The top is left alone: every screen's app bar already handles the status
/// bar.
class SystemBarsSafeArea extends StatelessWidget {
  const SystemBarsSafeArea({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: SafeArea(top: false, child: child),
    );
  }
}
