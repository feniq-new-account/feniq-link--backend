import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/offline/offline_status.dart';

/// Puts the offline strip above whatever screen is showing.
///
/// Used once, as the MaterialApp's `builder`. The screen below keeps one fixed
/// place in the tree whether the strip is shown or not, so the navigator (and
/// every page on it) is not rebuilt when the strip comes and goes.
class OfflineBannerFrame extends StatelessWidget {
  const OfflineBannerFrame({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<DateTime?>(
      valueListenable: OfflineStatus.instance.cachedSince,
      builder: (context, savedAt, _) {
        return Column(
          children: [
            savedAt == null ? const SizedBox.shrink() : OfflineStrip(savedAt: savedAt),
            Expanded(
              // The strip already sits under the status bar; the screen below
              // must not leave that gap a second time.
              child: MediaQuery.removePadding(context: context, removeTop: savedAt != null, child: child),
            ),
          ],
        );
      },
    );
  }
}

/// "You are looking at the copy saved on your phone from <time>."
class OfflineStrip extends StatelessWidget {
  const OfflineStrip({super.key, required this.savedAt});

  final DateTime savedAt;

  @override
  Widget build(BuildContext context) {
    final time = DateFormat('d/M HH:mm').format(savedAt.toLocal());
    return Material(
      color: AppColors.warningOf(context),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            children: [
              const Icon(Icons.cloud_off_outlined, size: 18, color: Colors.black87),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  context.l10n.offlineBannerMessage(time),
                  style: const TextStyle(fontSize: 12, color: Colors.black87, height: 1.3),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
