import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_padding.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/utils/validators.dart';
import 'package:feniq/core/widgets/app_snackbar.dart';
import 'package:feniq/core/widgets/app_text_field.dart';
import 'package:feniq/core/widgets/primary_button.dart';
import 'package:feniq/features/auth/presentation/managers/auth_cubit.dart';
import 'package:feniq/features/auth/presentation/managers/auth_state.dart';
import 'package:feniq/routes/route_names.dart';
import 'package:feniq/core/widgets/full_text.dart';

// Keys for the widget tests.
const Key changePasswordCurrentFieldKey = ValueKey('changePasswordCurrent');
const Key changePasswordNewFieldKey = ValueKey('changePasswordNew');
const Key changePasswordConfirmFieldKey = ValueKey('changePasswordConfirm');
const Key changePasswordSubmitKey = ValueKey('changePasswordSubmit');
const Key changePasswordForcedBannerKey = ValueKey('changePasswordForcedBanner');
const Key changePasswordLogoutKey = ValueKey('changePasswordLogout');

// Two ways in, one screen:
//
//   - Settings -> Change password: an ordinary pushed page. Back works, and a
//     successful change pops it with a confirmation.
//   - Forced, after an admin reset (SessionStatus.passwordChangeRequired): the
//     user signed in with a temporary password the admin has seen. AppRouter's
//     redirect sends every other route here, Back is disabled, and the only
//     ways out are a successful change (-> the app) or signing out.
//
// Which one is decided once, when the screen opens: a successful forced change
// flips the session to `active` while this screen is still on its way out,
// and it must not redraw itself as the Settings variant in between.
class ChangePasswordView extends StatefulWidget {
  const ChangePasswordView({super.key});

  @override
  State<ChangePasswordView> createState() => _ChangePasswordViewState();
}

class _ChangePasswordViewState extends State<ChangePasswordView> {
  final _formKey = GlobalKey<FormState>();
  final _currentController = TextEditingController();
  final _newController = TextEditingController();
  final _confirmController = TextEditingController();
  late final bool _forced;
  String? _error;

  @override
  void initState() {
    super.initState();
    _forced =
        context.read<AuthCubit>().state.sessionStatus ==
        SessionStatus.passwordChangeRequired;
  }

  @override
  void dispose() {
    _currentController.dispose();
    _newController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    context.unfocus();
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;

    final l10n = context.l10n;
    final cubit = context.read<AuthCubit>();
    final ok = await cubit.changePassword(
      currentPassword: _currentController.text,
      newPassword: _newController.text,
    );
    if (!mounted) return;
    if (!ok) {
      final state = cubit.state;
      setState(
        () => _error = translateErrorCode(
          l10n,
          state.errorCode,
          state.errorMessage ?? l10n.errorServer,
        ),
      );
      return;
    }

    AppSnackbar.show(context, l10n.changePasswordSuccess);
    if (_forced) {
      context.goNamed(RouteNames.warehouseSelection);
    } else {
      GoRouter.of(context).pop();
    }
  }

  Future<void> _logout() async {
    await context.read<AuthCubit>().logout();
    if (mounted) context.goNamed(RouteNames.login);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return PopScope(
      canPop: !_forced,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: AppColors.navyOf(context),
          foregroundColor: Colors.white,
          automaticallyImplyLeading: !_forced,
          title: FullText(l10n.changePasswordTitle, minScale: 0.6),
          actions: [
            if (_forced)
              TextButton(
                key: changePasswordLogoutKey,
                onPressed: _logout,
                style: TextButton.styleFrom(foregroundColor: Colors.white),
                child: Text(l10n.logout),
              ),
          ],
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: AppPadding.screen,
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_forced)
                    Container(
                      key: changePasswordForcedBannerKey,
                      padding: const EdgeInsets.all(AppSizes.spacingMedium),
                      decoration: BoxDecoration(
                        color: AppColors.warningSurfaceOf(context),
                        borderRadius: AppRadius.medium,
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.lock_reset, color: AppColors.warningOf(context)),
                          const SizedBox(width: AppSizes.spacingSmall),
                          Expanded(
                            child: Text(
                              l10n.changePasswordForcedMessage,
                              style: context.textTheme.bodyMedium,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    Text(
                      l10n.changePasswordSubtitle,
                      style: context.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondaryOf(context),
                      ),
                    ),
                  const SizedBox(height: AppSizes.spacingLarge),
                  AppTextField(
                    key: changePasswordCurrentFieldKey,
                    label: _forced
                        ? l10n.currentPasswordForcedLabel
                        : l10n.currentPasswordLabel,
                    controller: _currentController,
                    obscureText: true,
                    validator: (value) =>
                        Validators.validateRequired(value, l10n.fieldRequired),
                  ),
                  const SizedBox(height: AppSizes.spacingMedium),
                  AppTextField(
                    key: changePasswordNewFieldKey,
                    label: l10n.newPasswordLabel,
                    controller: _newController,
                    obscureText: true,
                    validator: (value) {
                      final basic = Validators.validateNewPassword(
                        value,
                        requiredMessage: l10n.fieldRequired,
                        tooShortMessage: l10n.passwordTooShort,
                      );
                      if (basic != null) return basic;
                      if (value == _currentController.text) {
                        return l10n.newPasswordSameAsCurrent;
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: AppSizes.spacingMedium),
                  AppTextField(
                    key: changePasswordConfirmFieldKey,
                    label: l10n.confirmNewPasswordLabel,
                    controller: _confirmController,
                    obscureText: true,
                    validator: (value) => Validators.validateConfirmPassword(
                      value,
                      _newController.text,
                      requiredMessage: l10n.fieldRequired,
                      mismatchMessage: l10n.passwordMismatch,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: AppSizes.spacingMedium),
                    Text(
                      _error!,
                      style: context.textTheme.bodyMedium?.copyWith(
                        color: AppColors.errorOf(context),
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSizes.spacingXLarge),
                  BlocBuilder<AuthCubit, AuthState>(
                    buildWhen: (previous, current) =>
                        previous.isSubmitting != current.isSubmitting,
                    builder: (context, state) => PrimaryButton(
                      key: changePasswordSubmitKey,
                      label: l10n.changePasswordAction,
                      isLoading: state.isSubmitting,
                      onPressed: _submit,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
