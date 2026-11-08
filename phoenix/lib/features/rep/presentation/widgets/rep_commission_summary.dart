import 'package:flutter/material.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/presentation/widgets/rep_stat_tile.dart';

/// These numbers come from different accounting engines and timelines.
/// Legacy delivered-order share is not Feniq cash collected. New-engine
/// commission is posted on eligible verified cash, not necessarily paid out.
class RepCommissionSummary extends StatelessWidget {
  const RepCommissionSummary({super.key, required this.stats});

  final RepStats stats;

  @override
  Widget build(BuildContext context) {
    if (!stats.hasCommission) return const SizedBox.shrink();
    final arabic = Localizations.localeOf(context).languageCode == 'ar';
    String tr(String ar, String en) => arabic ? ar : en;
    final noteStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
      color: AppColors.textSecondaryOf(context),
    );
    if (!stats.commissionBreakdownAvailable) {
      return Text(
        tr(
          'تفاصيل العمولة غير متاحة من السيرفر حالياً؛ لا يمكن اعتبار الرقم القديم مستحقاً أو مدفوعاً.',
          'Commission breakdown is unavailable from the server; the old combined figure cannot be treated as payable or paid.',
        ),
        style: noteStyle,
      );
    }

    final legacy = stats.monthLegacyDeliveredCommissionSyp!;
    final collected = stats.monthCollectedCommissionSyp!;
    if (legacy == 0 && collected == 0) {
      return Text(tr('لا توجد عمولات مسجّلة لهذه الفترة.', 'No commission recorded this period.'),
        style: noteStyle);
    }

    final suffix = tr('ل.س', 'SYP');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (legacy != 0) ...[
          RepStatTile(
            value: formatSyp(legacy, suffix),
            label: tr('عمولات الطلبيات المسلّمة (النظام السابق)',
              'Delivered-order commission (legacy)'),
          ),
          const SizedBox(height: 8),
        ],
        if (collected != 0) ...[
          RepStatTile(
            value: formatSyp(collected, suffix),
            label: tr('عمولة التحصيل المثبتة (النظام الجديد)',
              'Posted collected commission (new system)'),
          ),
          const SizedBox(height: 8),
        ],
        Text(
          tr(
            'العمولة المثبتة ليست إثبات دفع للمندوب. تصحيحات المرتجعات قد تُنقص الرصيد.',
            'Posted commission does not confirm a rep payout. Return corrections can reduce the figure.',
          ),
          style: noteStyle,
        ),
      ],
    );
  }
}
