import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_cubit.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_state.dart';
import 'package:feniq/features/medicine_directory/data/repositories/medicine_directory_repository.dart';
import 'package:feniq/routes/route_names.dart';

/// The door to the medicine directory, on the warehouse list: "13,044
/// medicines - search them even with no internet".
class DirectoryEntryCard extends StatelessWidget {
  const DirectoryEntryCard({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final repository = context.read<MedicineDirectoryRepository>();
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSizes.spacingMedium, AppSizes.spacingMedium, AppSizes.spacingMedium, 0),
      child: Material(
        color: AppColors.surfaceElevatedOf(context),
        shape: RoundedRectangleBorder(borderRadius: AppRadius.large, side: BorderSide(color: AppColors.borderOf(context))),
        child: InkWell(
          key: const ValueKey('directoryEntryCard'),
          borderRadius: AppRadius.large,
          onTap: () => context.pushNamed(RouteNames.medicineDirectory),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMedium, vertical: 14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primaryOf(context).withValues(alpha: 0.12),
                    borderRadius: AppRadius.medium,
                  ),
                  child: Icon(Icons.medication_outlined, color: AppColors.primaryOf(context)),
                ),
                const SizedBox(width: AppSizes.spacingMedium),
                Expanded(
                  // The count shows once the preparation has put the list on the phone.
                  child: BlocBuilder<DataPreparationCubit, DataPreparationState>(
                    builder: (context, _) {
                      final count = repository.current?.length ?? 0;
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l10n.directoryEntryTitle, style: context.textTheme.titleSmall),
                          const SizedBox(height: 2),
                          Text(
                            count > 0
                                ? l10n.directoryEntrySubtitle(NumberFormat.decimalPattern().format(count))
                                : l10n.directoryEntrySubtitleEmpty,
                            style: context.textTheme.bodySmall?.copyWith(color: AppColors.textSecondaryOf(context)),
                          ),
                        ],
                      );
                    },
                  ),
                ),
                Icon(Icons.chevron_right, color: AppColors.textSecondaryOf(context)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
