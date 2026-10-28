import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/empty_view.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/managers/rep_visits_cubit.dart';
import 'package:feniq/features/rep/presentation/widgets/rep_visit_tile.dart';

/// The rep's own visit log, newest first. Loads the next page as the list is
/// scrolled to its end.
class RepVisitsTab extends StatefulWidget {
  const RepVisitsTab({super.key});

  @override
  State<RepVisitsTab> createState() => _RepVisitsTabState();
}

class _RepVisitsTabState extends State<RepVisitsTab> {
  final ScrollController _controller = ScrollController();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onScroll);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_controller.hasClients) return;
    final position = _controller.position;
    if (position.pixels >= position.maxScrollExtent - 240) {
      context.read<RepVisitsCubit>().loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return AppRefreshIndicator(
      onRefresh: () => context.read<RepVisitsCubit>().load(),
      child: BlocBuilder<RepVisitsCubit, RepVisitsState>(
        builder: (context, state) {
          if (state.status == RepLoadStatus.error && state.visits.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: AppPadding.screen,
              children: [
                FailureWidget(
                  message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                  onRetry: () => context.read<RepVisitsCubit>().load(),
                ),
              ],
            );
          }
          if (state.visits.isEmpty) {
            final loading = state.status == RepLoadStatus.initial || state.status == RepLoadStatus.loading;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: AppPadding.screen,
              children: [
                const SizedBox(height: AppSizes.spacingXLarge),
                if (loading)
                  const Center(child: CircularProgressIndicator())
                else
                  EmptyView(
                    message: l10n.repNoVisitsTitle,
                    subtitle: l10n.repNoVisitsSubtitle,
                    icon: Icons.place_outlined,
                  ),
              ],
            );
          }
          final hasError = state.status == RepLoadStatus.error && !state.loadMoreError;
          final hasNotice = hasError || state.status == RepLoadStatus.loading;
          return ListView.separated(
            controller: _controller,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: AppPadding.screen,
            itemCount: state.visits.length + (hasNotice ? 1 : 0) + (state.isLoadingMore || state.loadMoreError ? 1 : 0),
            separatorBuilder: (_, _) => const SizedBox(height: AppSizes.spacingSmall),
            itemBuilder: (context, index) {
              if (hasNotice && index == 0) {
                return hasError
                    ? FailureWidget(
                        dense: true,
                        message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                        onRetry: () => context.read<RepVisitsCubit>().load(),
                      )
                    : const LinearProgressIndicator();
              }
              final i = index - (hasNotice ? 1 : 0);
              if (i >= state.visits.length) {
                if (state.loadMoreError) {
                  return FailureWidget(
                    dense: true,
                    message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                    onRetry: () => context.read<RepVisitsCubit>().loadMore(),
                  );
                }
                return const Padding(
                  padding: EdgeInsets.all(AppSizes.spacingMedium),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              return RepVisitTile(visit: state.visits[i]);
            },
          );
        },
      ),
    );
  }
}
