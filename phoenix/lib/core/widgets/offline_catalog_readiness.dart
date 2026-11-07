import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/offline/catalog_download_status.dart';

/// Compact readout for the city-filter row: only the last sync time, not a
/// second status panel beneath the warehouses. The retry affordance remains
/// visible on failure because hiding errors would mislead offline users.
class OfflineCatalogReadiness extends StatelessWidget {
  const OfflineCatalogReadiness({
    super.key,
    required this.warehouseIds,
    required this.onRetry,
  });

  final List<String> warehouseIds;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (warehouseIds.isEmpty) return const SizedBox.shrink();
    return ValueListenableBuilder<Map<String, CatalogDownloadEntry>>(
      valueListenable: CatalogDownloadStatus.instance.entries,
      builder: (context, entries, _) {
        final selected = warehouseIds.map((id) => entries[id]).toList();
        final dates = selected
            .map((entry) => entry?.savedAt)
            .whereType<DateTime>()
            .toList()
          ..sort();
        final failed = selected.any((entry) => entry?.phase == CatalogDownloadPhase.failed);
        final downloading = selected.any((entry) => entry?.phase == CatalogDownloadPhase.downloading);
        if (dates.isEmpty && !failed && !downloading) {
          return const SizedBox.shrink();
        }

        // Local time only. A full date takes space and is not useful on this
        // row; screen readers still get the "last synchronization" label.
        final time = dates.isEmpty ? null : DateFormat('HH:mm', 'en_US').format(dates.first.toLocal());
        final secondary = AppColors.textSecondaryOf(context);
        return Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 4,
          children: [
            if (time != null)
              Tooltip(
                message: context.l10n.offlineCatalogsLastSync(time),
                child: Semantics(
                  label: context.l10n.offlineCatalogsLastSync(time),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.sync_outlined, size: 14, color: secondary),
                      const SizedBox(width: 3),
                      Text(
                        time,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontSize: 11,
                          color: secondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (downloading)
              SizedBox(
                width: 12,
                height: 12,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: secondary,
                ),
              ),
            if (failed)
              Tooltip(
                message: context.l10n.offlineCatalogsRetry,
                child: IconButton(
                  onPressed: onRetry,
                  visualDensity: VisualDensity.compact,
                  constraints: const BoxConstraints(minHeight: 32, minWidth: 32),
                  icon: Icon(Icons.sync_problem_outlined, size: 18, color: AppColors.errorOf(context)),
                ),
              ),
          ],
        );
      },
    );
  }
}
