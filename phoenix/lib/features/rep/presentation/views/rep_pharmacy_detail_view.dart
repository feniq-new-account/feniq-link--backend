import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/date_formatter.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/app_refresh_indicator.dart';
import 'package:feniq/core/widgets/custom_card.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/cart/presentation/utils/order_status_label.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/managers/rep_pharmacy_detail_cubit.dart';
import 'package:feniq/features/rep/presentation/utils/rep_labels.dart';
import 'package:feniq/features/rep/presentation/widgets/rep_visit_tile.dart';
import 'package:feniq/routes/route_names.dart';

/// One of the rep's pharmacies: where it is, how it has been going, and the
/// button that logs a visit there.
class RepPharmacyDetailView extends StatelessWidget {
  const RepPharmacyDetailView({super.key});

  Future<void> _call(String phone) async {
    try {
      await launchUrl(Uri(scheme: 'tel', path: phone));
    } catch (_) {
      // No dialer on this device - nothing useful to show.
    }
  }

  Future<void> _logVisit(BuildContext context) async {
    final cubit = context.read<RepPharmacyDetailCubit>();
    final logged = await context.pushNamed<bool>(RouteNames.repScan);
    if (logged == true) cubit.load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: BlocBuilder<RepPharmacyDetailCubit, RepPharmacyDetailState>(
          buildWhen: (a, b) => a.detail != b.detail,
          builder: (context, state) {
            final pharmacy = state.detail?.pharmacy;
            return FullText(
              pharmacy == null ? '' : repPharmacyName(context, pharmacy.nameAr, pharmacy.nameEn),
              minScale: 0.6,
            );
          },
        ),
      ),
      body: AppRefreshIndicator(
        onRefresh: () => context.read<RepPharmacyDetailCubit>().load(),
        child: BlocBuilder<RepPharmacyDetailCubit, RepPharmacyDetailState>(
          builder: (context, state) {
            final detail = state.detail;
            if (detail == null) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: AppPadding.screen,
                children: [
                  if (state.status == RepLoadStatus.error)
                    FailureWidget(
                      message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                      onRetry: () => context.read<RepPharmacyDetailCubit>().load(),
                    )
                  else
                    const Padding(
                      padding: EdgeInsets.all(AppSizes.spacingXLarge),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                ],
              );
            }
            return _Body(detail: detail, onCall: _call, onLogVisit: () => _logVisit(context));
          },
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.detail, required this.onCall, required this.onLogVisit});

  final RepPharmacyDetail detail;
  final Future<void> Function(String phone) onCall;
  final VoidCallback onLogVisit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final pharmacy = detail.pharmacy;
    final activity = pharmacy.activity;
    final textSecondary = AppColors.textSecondaryOf(context);
    final place = [pharmacy.city, pharmacy.address].whereType<String>().where((s) => s.trim().isNotEmpty).join(' · ');
    final phone = pharmacy.phone;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: AppPadding.screen,
      children: [
        CustomCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((pharmacy.ownerName ?? '').isNotEmpty)
                _InfoLine(icon: Icons.person_outline, label: l10n.repOwnerLabel, value: pharmacy.ownerName!),
              if (place.isNotEmpty) _InfoLine(icon: Icons.place_outlined, label: l10n.addressLabel, value: place),
              if (phone != null && phone.isNotEmpty)
                Row(
                  children: [
                    Expanded(
                      child: _InfoLine(icon: Icons.phone_outlined, label: l10n.phoneLabel, value: ltrIsolate(phone)),
                    ),
                    IconButton(
                      onPressed: () => onCall(phone),
                      tooltip: l10n.repCallAction,
                      icon: Icon(Icons.call, color: AppColors.primaryOf(context)),
                    ),
                  ],
                ),
            ],
          ),
        ),
        if (!pharmacy.hasLocation) ...[
          const SizedBox(height: AppSizes.spacingSmall),
          Container(
            padding: const EdgeInsets.all(AppSizes.spacingMedium),
            decoration: BoxDecoration(
              color: AppColors.primaryOf(context).withValues(alpha: 0.1),
              borderRadius: AppRadius.small,
            ),
            child: Row(
              children: [
                Icon(Icons.location_off_outlined, color: AppColors.primaryOf(context)),
                const SizedBox(width: AppSizes.spacingSmall),
                Expanded(child: Text(l10n.repNoLocationWarning, style: context.textTheme.bodySmall)),
              ],
            ),
          ),
        ],
        const SizedBox(height: AppSizes.spacingMedium),
        CustomCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(lastVisitText(l10n, activity.lastVisitAt, DateTime.now()), style: context.textTheme.titleSmall),
              const SizedBox(height: AppSizes.spacingXSmall),
              Text(
                '${l10n.repMonthOrdersCount(activity.monthOrdersCount)} · '
                '${formatSyp(activity.monthOrdersTotal, l10n.currencySuffix)}',
                style: context.textTheme.bodyMedium?.copyWith(color: textSecondary),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        PrimaryButton(label: l10n.repLogVisitAction, onPressed: onLogVisit),
        const SizedBox(height: AppSizes.spacingLarge),
        _SectionTitle(l10n.repRecentOrders),
        if (detail.orders.isEmpty)
          Text(l10n.repNoOrdersYet, style: context.textTheme.bodyMedium?.copyWith(color: textSecondary))
        else
          for (final order in detail.orders) ...[_OrderTile(order: order), const SizedBox(height: AppSizes.spacingSmall)],
        const SizedBox(height: AppSizes.spacingMedium),
        _SectionTitle(l10n.repRecentVisits),
        if (detail.visits.isEmpty)
          Text(l10n.repNoVisitsHere, style: context.textTheme.bodyMedium?.copyWith(color: textSecondary))
        else
          for (final visit in detail.visits) ...[
            RepVisitTile(visit: visit, showPharmacy: false),
            const SizedBox(height: AppSizes.spacingSmall),
          ],
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: AppSizes.spacingSmall),
    child: Text(text, style: context.textTheme.titleSmall),
  );
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSizes.spacingXSmall),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.textSecondaryOf(context)),
          const SizedBox(width: AppSizes.spacingSmall),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                ),
                Text(value, style: context.textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order});

  final RepOrder order;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final when = order.createdAt == null ? '' : DateFormatter.formatDateTime(order.createdAt!);
    return CustomCard(
      padding: const EdgeInsets.all(AppSizes.spacingMedium),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.orderNumberLabel(order.orderNumber.toString()), style: context.textTheme.titleSmall),
                Text(
                  '${orderStatusLabel(l10n, order.status)} · $when',
                  style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                ),
              ],
            ),
          ),
          Text(
            formatSyp(order.finalPrice, l10n.currencySuffix),
            style: context.textTheme.titleSmall?.copyWith(color: AppColors.primaryOf(context)),
          ),
        ],
      ),
    );
  }
}
