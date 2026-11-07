import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';

/// A short, positive announcement for the pharmacist-facing early launch.
/// Purely informational: it never changes ordering, authentication or the
/// operational launch-status response from the server.
class EarlyLaunchNotice extends StatelessWidget {
  const EarlyLaunchNotice({super.key, this.nowUtc});

  /// Injectable clock to test the cutoff without changing the device time.
  final DateTime? nowUtc;

  // Exclusive boundary: 16 Nov 2026 00:00 in Damascus (UTC+03).
  static final DateTime _endsAtUtc = DateTime.utc(2026, 11, 15, 21);

  @override
  Widget build(BuildContext context) {
    if (!(nowUtc ?? DateTime.now().toUtc()).isBefore(_endsAtUtc)) {
      return const SizedBox.shrink();
    }
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSizes.spacingMedium, 6, AppSizes.spacingMedium, 0,
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.primaryOf(context).withValues(alpha: 0.09),
          borderRadius: AppRadius.small,
          border: Border.all(
            color: AppColors.primaryOf(context).withValues(alpha: 0.2),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8, top: 1),
                child: Icon(
                  Icons.rocket_launch_outlined,
                  color: AppColors.primaryOf(context),
                  size: 19,
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      isArabic
                          ? 'مرحلة الإطلاق المبكر'
                          : 'Early launch phase',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppColors.primaryOf(context),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      isArabic
                          ? 'تصفّح المنتجات والعروض الآن. يبدأ استقبال الطلبات عبر فينيق اعتباراً من 16 تشرين الثاني، مع إضافة مستودعات جديدة أسبوعياً.'
                          : 'Explore products and offers now. Ordering through Feniq begins November 16, with new warehouses joining every week.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondaryOf(context),
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
