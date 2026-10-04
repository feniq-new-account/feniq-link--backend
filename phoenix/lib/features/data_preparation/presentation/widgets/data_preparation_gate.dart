import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/error/failure.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/widgets/brand_logo.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_cubit.dart';
import 'package:feniq/features/data_preparation/presentation/managers/data_preparation_state.dart';

/// Wraps the app's main screens. It starts the phone's preparation (the
/// medicine directory and the warehouse catalogs, saved on the phone) when the
/// pharmacist lands, and - only the very first time on a phone - covers the
/// app with the "please wait a couple of minutes" screen while it runs.
class DataPreparationGate extends StatefulWidget {
  const DataPreparationGate({super.key, required this.child});

  final Widget child;

  @override
  State<DataPreparationGate> createState() => _DataPreparationGateState();
}

class _DataPreparationGateState extends State<DataPreparationGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<DataPreparationCubit>().start();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        BlocBuilder<DataPreparationCubit, DataPreparationState>(
          buildWhen: (previous, current) => previous.showsOverlay != current.showsOverlay || current.showsOverlay,
          builder: (context, state) {
            if (!state.showsOverlay) return const SizedBox.shrink();
            return Positioned.fill(child: PreparationScreen(state: state));
          },
        ),
      ],
    );
  }
}

/// The full-screen "getting your pharmacy ready" page.
class PreparationScreen extends StatelessWidget {
  const PreparationScreen({super.key, required this.state});

  final DataPreparationState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final failed = state.status == PreparationStatus.failed;
    final done = state.status == PreparationStatus.done;
    final cubit = context.read<DataPreparationCubit>();

    return Material(
      color: AppColors.navyOf(context),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSizes.spacingLarge),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: BrandLogo.onDark(width: 150)),
                  const SizedBox(height: AppSizes.spacingXLarge),
                  Text(
                    failed ? l10n.preparationFailedTitle : l10n.preparationTitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: AppSizes.spacingMedium),
                  Text(
                    failed ? _failureText(context) : (done ? l10n.preparationDone : l10n.preparationPatience),
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 14.5, height: 1.5),
                  ),
                  const SizedBox(height: AppSizes.spacingLarge),
                  if (failed) ...[
                    PrimaryButton(label: l10n.preparationRetry, onPressed: () => cubit.start(force: true)),
                    const SizedBox(height: AppSizes.spacingSmall),
                    TextButton(
                      onPressed: cubit.skip,
                      child: Text(l10n.preparationSkip, style: const TextStyle(color: Colors.white70)),
                    ),
                  ] else ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: LinearProgressIndicator(
                        key: const ValueKey('preparationProgress'),
                        value: done ? 1 : state.fraction.clamp(0.02, 1.0),
                        minHeight: 10,
                        backgroundColor: Colors.white.withValues(alpha: 0.14),
                        valueColor: AlwaysStoppedAnimation<Color>(AppColors.primaryOf(context)),
                      ),
                    ),
                    const SizedBox(height: AppSizes.spacingSmall),
                    Text(
                      done ? '100%' : '${(state.fraction * 100).floor()}%',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                    ),
                    if (!done) ...[
                      const SizedBox(height: 2),
                      Text(
                        _stepText(context),
                        key: const ValueKey('preparationStep'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white60, fontSize: 12.5),
                      ),
                      const SizedBox(height: AppSizes.spacingMedium),
                      TextButton(
                        onPressed: cubit.skip,
                        child: Text(l10n.preparationSkip, style: const TextStyle(color: Colors.white54, fontSize: 12.5)),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _stepText(BuildContext context) {
    final l10n = context.l10n;
    final number = NumberFormat.decimalPattern();
    if (state.step == PreparationStep.directory) {
      if (state.directoryTotal <= 0) return l10n.preparationStepDirectoryStarting;
      return l10n.preparationStepDirectory(number.format(state.directoryLoaded), number.format(state.directoryTotal));
    }
    return l10n.preparationStepWarehouse(
      state.warehouseName,
      state.warehouseIndex.toString(),
      state.warehouseCount.toString(),
      number.format(state.warehouseLoaded),
    );
  }

  String _failureText(BuildContext context) {
    final l10n = context.l10n;
    final code = state.errorCode;
    if (code == FailureCode.network || code == FailureCode.timeout) return l10n.preparationFailedNoConnection;
    return translateErrorCode(l10n, code, state.errorMessage ?? l10n.errorState);
  }
}
