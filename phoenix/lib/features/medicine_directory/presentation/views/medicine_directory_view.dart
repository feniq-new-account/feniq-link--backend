import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_snackbar.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/catalog/presentation/widgets/catalog_search_bar.dart';
import 'package:feniq/features/medicine_directory/presentation/managers/directory_cubit.dart';
import 'package:feniq/features/medicine_directory/presentation/managers/directory_state.dart';
import 'package:feniq/features/medicine_directory/presentation/widgets/directory_item_sheet.dart';
import 'package:feniq/features/medicine_directory/presentation/widgets/directory_item_tile.dart';

/// Every medicine of the central catalog, searchable by name, company or active
/// ingredient - answered from the copy saved on the phone, so it works with no
/// connection and does not slow anything down.
class MedicineDirectoryView extends StatefulWidget {
  const MedicineDirectoryView({super.key});

  @override
  State<MedicineDirectoryView> createState() => _MedicineDirectoryViewState();
}

class _MedicineDirectoryViewState extends State<MedicineDirectoryView> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<DirectoryCubit>();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: Text(l10n.directoryEntryTitle),
        actions: [
          BlocBuilder<DirectoryCubit, DirectoryState>(
            buildWhen: (a, b) => a.refreshing != b.refreshing || a.status != b.status,
            builder: (context, state) {
              if (state.status != DirectoryStatus.ready) return const SizedBox.shrink();
              if (state.refreshing) {
                return const Padding(
                  padding: EdgeInsets.all(16),
                  child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                );
              }
              return IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: l10n.directoryRefreshTooltip,
                onPressed: cubit.refresh,
              );
            },
          ),
        ],
        bottom: CatalogSearchBar(
          controller: _searchController,
          hintText: l10n.directorySearchHint,
          onChanged: cubit.search,
        ),
      ),
      body: BlocConsumer<DirectoryCubit, DirectoryState>(
        listenWhen: (previous, current) => current.notice != null && previous.notice != current.notice,
        listener: (context, state) {
          final message = switch (state.notice) {
            DirectoryNotice.upToDate => l10n.directoryUpToDate,
            DirectoryNotice.failed => l10n.directoryUpdateFailed,
            _ => null,
          };
          if (message != null) AppSnackbar.show(context, message);
        },
        builder: (context, state) {
          switch (state.status) {
            case DirectoryStatus.loading:
              return const Center(child: CircularProgressIndicator());
            case DirectoryStatus.downloading:
              return _Downloading(state: state);
            case DirectoryStatus.empty:
              return _NotDownloaded(state: state, onDownload: cubit.download);
            case DirectoryStatus.ready:
              return _Results(state: state);
          }
        },
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({required this.state});

  final DirectoryState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<DirectoryCubit>();
    final number = NumberFormat.decimalPattern();
    final savedAt = state.savedAt;
    final updated = savedAt == null ? null : DateFormat('d/M HH:mm').format(savedAt.toLocal());

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  l10n.directoryResultsCount(number.format(state.results.length), number.format(state.total)),
                  key: const ValueKey('directoryCount'),
                  style: context.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              if (updated != null)
                Text(
                  l10n.directoryUpdatedAt(updated),
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                ),
            ],
          ),
        ),
        Divider(height: 1, color: AppColors.borderOf(context)),
        Expanded(
          child: state.results.isEmpty
              ? EmptyView(message: l10n.directoryNothingFound, icon: Icons.search_off_outlined)
              : ListView.separated(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  itemCount: state.results.length,
                  separatorBuilder: (_, _) => Divider(height: 1, color: AppColors.borderOf(context)),
                  itemBuilder: (context, index) {
                    final item = state.results[index];
                    return DirectoryItemTile(
                      item: item,
                      onTap: () => showDirectoryItemSheet(context, item: item, alternatives: cubit.alternativesOf(item)),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _NotDownloaded extends StatelessWidget {
  const _NotDownloaded({required this.state, required this.onDownload});

  final DirectoryState state;
  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final code = state.errorCode;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingXLarge),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_download_outlined, size: 72, color: AppColors.textOf(context).withValues(alpha: 0.35)),
            const SizedBox(height: AppSizes.spacingMedium),
            Text(l10n.directoryNotDownloadedTitle, style: context.textTheme.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: AppSizes.spacingSmall),
            Text(
              code == null ? l10n.directoryNotDownloadedBody : translateErrorCode(l10n, code, l10n.errorState),
              textAlign: TextAlign.center,
              style: context.textTheme.bodyMedium,
            ),
            const SizedBox(height: AppSizes.spacingLarge),
            PrimaryButton(label: l10n.directoryDownloadButton, onPressed: onDownload),
          ],
        ),
      ),
    );
  }
}

class _Downloading extends StatelessWidget {
  const _Downloading({required this.state});

  final DirectoryState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final number = NumberFormat.decimalPattern();
    final total = state.downloadTotal;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingXLarge),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LinearProgressIndicator(value: total <= 0 ? null : (state.loaded / total).clamp(0.0, 1.0), minHeight: 8),
            const SizedBox(height: AppSizes.spacingMedium),
            Text(
              total <= 0 ? l10n.preparationStepDirectoryStarting : l10n.directoryDownloading(number.format(state.loaded), number.format(total)),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
