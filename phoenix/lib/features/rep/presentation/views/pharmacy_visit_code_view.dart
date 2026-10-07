import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/display_name.dart';
import 'package:feniq/core/widgets/failure_widget.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/features/rep/presentation/managers/rep_load_status.dart';
import 'package:feniq/features/rep/presentation/managers/visit_code_cubit.dart';

/// The pharmacy's own visit QR: what a warehouse's rep scans when they come
/// by. The same code the printed sticker carries.
class PharmacyVisitCodeView extends StatelessWidget {
  const PharmacyVisitCodeView({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.navyOf(context),
        foregroundColor: Colors.white,
        title: FullText(l10n.pharmacyVisitCodeTitle, minScale: 0.6),
      ),
      body: BlocBuilder<VisitCodeCubit, VisitCodeState>(
        builder: (context, state) {
          final code = state.code;
          if (code == null) {
            return ListView(
              padding: AppPadding.screen,
              children: [
                if (state.status == RepLoadStatus.error)
                  FailureWidget(
                    message: translateErrorCode(l10n, state.errorCode, state.errorMessage ?? ''),
                    onRetry: () => context.read<VisitCodeCubit>().load(),
                  )
                else
                  const Padding(
                    padding: EdgeInsets.all(AppSizes.spacingXLarge),
                    child: Center(child: CircularProgressIndicator()),
                  ),
              ],
            );
          }
          return ListView(
            padding: AppPadding.screen,
            children: [
              Text(
                l10n.pharmacyVisitCodeIntro,
                style: context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context)),
              ),
              const SizedBox(height: AppSizes.spacingLarge),
              Center(
                // A QR is read by contrast, so it stays black on white in
                // night mode too.
                child: Container(
                  padding: const EdgeInsets.all(AppSizes.spacingMedium),
                  decoration: const BoxDecoration(color: Colors.white, borderRadius: AppRadius.large),
                  // Keyed by what it encodes, so a test (which cannot read a
                  // QrImageView's data) can tell which code is on screen.
                  child: QrImageView(
                    key: ValueKey(code.qrPayload),
                    data: code.qrPayload,
                    size: 260,
                    backgroundColor: Colors.white,
                  ),
                ),
              ),
              const SizedBox(height: AppSizes.spacingMedium),
              Center(
                child: Text(
                  ltrIsolate(code.code),
                  style: context.textTheme.titleMedium?.copyWith(letterSpacing: 2, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
