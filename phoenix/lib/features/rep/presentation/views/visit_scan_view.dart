import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/full_text.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/rep/data/models/rep_models.dart';
import 'package:feniq/features/rep/data/services/location_provider.dart';
import 'package:feniq/features/rep/presentation/managers/visit_scan_cubit.dart';
import 'package:feniq/features/rep/presentation/utils/rep_labels.dart';
import 'package:feniq/generated/app_localizations.dart';

/// Logging a visit: the camera looks for a pharmacy's Feniq QR, the phone's
/// position is read, and the server decides whether the visit counts. Pops
/// with `true` once a visit was recorded, so the screen behind can refresh.
class VisitScanView extends StatefulWidget {
  const VisitScanView({super.key});

  @override
  State<VisitScanView> createState() => _VisitScanViewState();
}

class _VisitScanViewState extends State<VisitScanView> {
  late final MobileScannerController _scanner = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    // A frame with the same QR in it is reported again and again; the cubit
    // ignores everything but the first while it is busy.
    detectionSpeed: DetectionSpeed.normal,
  );

  @override
  void dispose() {
    _scanner.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    final raw = capture.barcodes.isEmpty ? null : capture.barcodes.first.rawValue;
    context.read<VisitScanCubit>().onCodeDetected(raw);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocBuilder<VisitScanCubit, VisitScanState>(
      builder: (context, state) {
        final recorded = state.status == VisitScanStatus.done;
        return PopScope<Object?>(
          // The system Back gesture after a recorded visit still has to tell
          // the previous screen to refresh.
          canPop: !recorded && state.status != VisitScanStatus.submitting,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && recorded) GoRouter.of(context).pop(true);
          },
          child: Scaffold(
            backgroundColor: Colors.black,
            appBar: AppBar(
              backgroundColor: AppColors.navyOf(context),
              foregroundColor: Colors.white,
              title: FullText(l10n.repScanTitle, minScale: 0.6),
            ),
            body: Stack(
              fit: StackFit.expand,
              children: [
                MobileScanner(
                  controller: _scanner,
                  onDetect: _onDetect,
                  errorBuilder: (context, error) => _CameraError(error: error),
                ),
                const _ScanFrame(),
                Align(
                  alignment: Alignment.bottomCenter,
                  child: _Panel(state: state),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ScanFrame extends StatelessWidget {
  const _ScanFrame();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Center(
        child: Container(
          width: 240,
          height: 240,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.white, width: 3),
            borderRadius: AppRadius.medium,
          ),
        ),
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.error});

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Container(
      color: Colors.black,
      padding: const EdgeInsets.all(AppSizes.spacingXLarge),
      alignment: Alignment.center,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography_outlined, color: Colors.white70, size: 56),
            const SizedBox(height: AppSizes.spacingMedium),
            Text(
              denied ? l10n.repCameraDenied : l10n.repCameraUnavailable,
              textAlign: TextAlign.center,
              style: context.textTheme.bodyLarge?.copyWith(color: Colors.white),
            ),
            if (denied) ...[
              const SizedBox(height: AppSizes.spacingMedium),
              OutlinedButton(
                onPressed: Geolocator.openAppSettings,
                style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                child: Text(l10n.repOpenSettings),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Whatever the scan is doing right now, as a card over the bottom of the
/// camera: the hint, a progress line, the result, or what went wrong.
class _Panel extends StatelessWidget {
  const _Panel({required this.state});

  final VisitScanState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<VisitScanCubit>();

    final Widget content;
    switch (state.status) {
      case VisitScanStatus.scanning:
        content = _Message(
          icon: state.notFeniqCode ? Icons.error_outline : Icons.qr_code_2,
          iconColor: state.notFeniqCode ? AppColors.errorOf(context) : null,
          title: state.notFeniqCode ? l10n.repScanNotFeniq : l10n.repScanHint,
        );
      case VisitScanStatus.locating:
        content = _Progress(label: l10n.repScanLocating);
      case VisitScanStatus.submitting:
        content = _Progress(label: l10n.repScanSubmitting);
      case VisitScanStatus.done:
        content = _Result(result: state.result!, onAnother: cubit.scanAgain);
      case VisitScanStatus.failed:
        content = _Failure(state: state, onRetry: cubit.scanAgain);
    }

    return SafeArea(
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.all(AppSizes.spacingMedium),
        padding: const EdgeInsets.all(AppSizes.spacingMedium),
        decoration: BoxDecoration(color: AppColors.surfaceElevatedOf(context), borderRadius: AppRadius.large),
        child: SingleChildScrollView(child: content),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.title, this.iconColor, this.body});

  final IconData icon;
  final Color? iconColor;
  final String title;
  final String? body;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 30, color: iconColor ?? AppColors.primaryOf(context)),
        const SizedBox(width: AppSizes.spacingMedium),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: context.textTheme.titleSmall),
              if (body != null) ...[
                const SizedBox(height: AppSizes.spacingXSmall),
                Text(body!, style: context.textTheme.bodyMedium?.copyWith(color: AppColors.textSecondaryOf(context))),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 3)),
        const SizedBox(width: AppSizes.spacingMedium),
        Expanded(child: Text(label, style: context.textTheme.titleSmall)),
      ],
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.result, required this.onAnother});

  final RecordedVisit result;
  final VoidCallback onAnother;

  String _title(AppLocalizations l10n) {
    if (!result.visit.status.isVerified) return l10n.repScanUnverifiedTitle;
    return result.duplicate ? l10n.repScanDuplicateTitle : l10n.repScanVerifiedTitle;
  }

  String? _body(AppLocalizations l10n) {
    switch (result.visit.status) {
      case VisitStatus.verified:
        return null;
      case VisitStatus.outOfRange:
        return l10n.repScanOutOfRangeMessage(result.visit.distanceMeters ?? 0);
      case VisitStatus.mockLocation:
        return l10n.repScanMockMessage;
      case VisitStatus.noPharmacyLocation:
        return l10n.repScanNoLocationMessage;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final verified = result.visit.status.isVerified;
    final name = repPharmacyName(context, result.pharmacyNameAr, result.pharmacyNameEn);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Message(
          icon: verified ? Icons.check_circle : Icons.warning_amber_rounded,
          iconColor: verified ? AppColors.secondaryOf(context) : AppColors.primaryOf(context),
          title: _title(l10n),
          body: [name, _body(l10n)].whereType<String>().where((s) => s.isNotEmpty).join('\n'),
        ),
        const SizedBox(height: AppSizes.spacingMedium),
        PrimaryButton(label: l10n.repScanAnother, onPressed: onAnother),
        TextButton(onPressed: () => GoRouter.of(context).pop(true), child: Text(l10n.close)),
      ],
    );
  }
}

class _Failure extends StatelessWidget {
  const _Failure({required this.state, required this.onRetry});

  final VisitScanState state;
  final VoidCallback onRetry;

  String _message(AppLocalizations l10n) {
    switch (state.locationProblem) {
      case LocationProblem.serviceDisabled:
        return l10n.repLocationServiceOff;
      case LocationProblem.permissionDenied:
        return l10n.repLocationDenied;
      case LocationProblem.permissionDeniedForever:
        return l10n.repLocationDeniedForever;
      case LocationProblem.unavailable:
        return l10n.repLocationUnavailable;
      case null:
        return translateErrorCode(l10n, state.errorCode, state.errorMessage ?? '');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final problem = state.locationProblem;
    final settings = switch (problem) {
      LocationProblem.serviceDisabled => Geolocator.openLocationSettings,
      LocationProblem.permissionDeniedForever => Geolocator.openAppSettings,
      _ => null,
    };

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Message(icon: Icons.error_outline, iconColor: AppColors.errorOf(context), title: _message(l10n)),
        const SizedBox(height: AppSizes.spacingMedium),
        PrimaryButton(label: l10n.repScanTryAgain, onPressed: onRetry),
        if (settings != null) TextButton(onPressed: settings, child: Text(l10n.repOpenSettings)),
        TextButton(onPressed: () => GoRouter.of(context).pop(false), child: Text(l10n.close)),
      ],
    );
  }
}
