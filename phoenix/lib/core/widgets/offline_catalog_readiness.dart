import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/offline/catalog_download_status.dart';

class OfflineCatalogReadiness extends StatelessWidget {
  const OfflineCatalogReadiness({super.key, required this.warehouseIds, required this.onRetry});
  final List<String> warehouseIds;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (warehouseIds.isEmpty) return const SizedBox.shrink();
    return ValueListenableBuilder<Map<String, CatalogDownloadEntry>>(
      valueListenable: CatalogDownloadStatus.instance.entries,
      builder: (context, entries, _) {
        final selected = warehouseIds.map((id) => entries[id]).toList();
        final saved = selected.where((entry) => entry?.savedAt != null).toList();
        final downloading = selected.any((entry) => entry?.phase == CatalogDownloadPhase.downloading);
        final failed = selected.any((entry) => entry?.phase == CatalogDownloadPhase.failed);
        final dates = saved.map((entry) => entry!.savedAt).whereType<DateTime>().toList()..sort();
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Icon(
                  saved.length == warehouseIds.length ? Icons.offline_pin_outlined : Icons.download_outlined,
                  size: 20,
                  color: AppColors.textSecondaryOf(context),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n.offlineCatalogsReady('${saved.length}', '${warehouseIds.length}'),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (downloading)
                      Text(context.l10n.offlineCatalogsSaving, style: Theme.of(context).textTheme.bodySmall),
                    if (dates.isNotEmpty)
                      Text(
                        context.l10n.offlineCatalogsLastSync(
                          DateFormat('d/M/yyyy HH:mm', 'en_US').format(dates.first.toLocal()),
                        ),
                        style: Theme.of(
                          context,
                        ).textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                      ),
                    if (failed) Text(context.l10n.offlineCatalogsRetry, style: Theme.of(context).textTheme.bodySmall),
                    if (failed && !downloading) TextButton(onPressed: onRetry, child: Text(context.l10n.retryButton)),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
