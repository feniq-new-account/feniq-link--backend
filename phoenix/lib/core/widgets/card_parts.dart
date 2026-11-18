import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/generated/app_localizations.dart';

/// The header every summary card on the accounts tab and the insights screen
/// shares: an icon on a tinted tile, the title, and an optional refresh
/// (design review 2026-11-18: one look for every card).
class CardHeader extends StatelessWidget {
  const CardHeader({super.key, required this.icon, required this.title, this.onRefresh});

  final IconData icon;
  final String title;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.primaryOf(context).withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Icon(icon, size: 22, color: AppColors.primaryOf(context)),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(title, style: context.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        ),
        if (onRefresh != null)
          IconButton(
            tooltip: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel,
            icon: const Icon(Icons.refresh),
            onPressed: onRefresh,
          ),
      ],
    );
  }
}

/// A card's "could not load" line: one look everywhere, compact, with retry
/// beside it, so a failed card never pushes the working ones off the screen.
class CardLoadError extends StatelessWidget {
  const CardLoadError({super.key, required this.message, required this.onRetry, this.retryLabel});

  final String message;
  final VoidCallback onRetry;

  /// Defaults to the app's "retry" wording.
  final String? retryLabel;

  @override
  Widget build(BuildContext context) {
    final color = AppColors.warningOf(context);
    return Container(
      key: const ValueKey('card-load-error'),
      width: double.infinity,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsetsDirectional.fromSTEB(12, 4, 4, 4),
      decoration: BoxDecoration(
        color: AppColors.warningSurfaceOf(context),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_outlined, size: 20, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(message, style: context.textTheme.bodySmall)),
          TextButton(
            style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
            onPressed: onRetry,
            // Some cards render outside the app's localizations (their own
            // tests): fall back to the Arabic wording rather than fail.
            child: Text(retryLabel ?? AppLocalizations.of(context)?.retryButton ?? 'إعادة المحاولة'),
          ),
        ],
      ),
    );
  }
}
