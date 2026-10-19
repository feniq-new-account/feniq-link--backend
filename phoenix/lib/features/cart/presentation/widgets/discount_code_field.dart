import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:feniq/core/constants/app_colors.dart';
import 'package:feniq/core/constants/app_radius.dart';
import 'package:feniq/core/constants/app_sizes.dart';
import 'package:feniq/core/error/error_translator.dart';
import 'package:feniq/core/extensions/build_context_extensions.dart';
import 'package:feniq/core/theme/app_text_theme.dart';
import 'package:feniq/features/cart/presentation/managers/cart_cubit.dart';
import 'package:feniq/features/cart/presentation/managers/cart_state.dart';

/// The cart's discount code: a field with Apply while none is applied, the
/// applied code with Remove once one is. Why a code was refused (or came off
/// the cart) is shown right under it, in the pharmacist's language.
///
/// Codes are generated upper case from an alphabet without 0/O or 1/I/L, so
/// the field upper-cases as it goes and takes letters and digits only.
class DiscountCodeField extends StatefulWidget {
  const DiscountCodeField({super.key});

  @override
  State<DiscountCodeField> createState() => _DiscountCodeFieldState();
}

class _DiscountCodeFieldState extends State<DiscountCodeField> {
  final TextEditingController _controller = TextEditingController();

  // This field's own Apply is in the air - the button's spinner. The cart
  // re-quoting after an edit also raises CartState.isQuoting, and that is the
  // summary's business, not this button's.
  bool _applying = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    FocusScope.of(context).unfocus();
    setState(() => _applying = true);
    await context.read<CartCubit>().applyDiscountCode(_controller.text);
    if (mounted) setState(() => _applying = false);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocConsumer<CartCubit, CartState>(
      listenWhen: (previous, current) => previous.discountCode != current.discountCode,
      // The typed text goes once the code is applied (the chip shows it), and
      // stays after a refusal so the pharmacist can correct it.
      listener: (context, state) {
        if (state.discountCode != null) _controller.clear();
      },
      buildWhen: (previous, current) =>
          previous.discountCode != current.discountCode ||
          previous.isQuoting != current.isQuoting ||
          previous.discountCodeErrorCode != current.discountCodeErrorCode,
      builder: (context, state) {
        final error = state.discountCodeErrorCode == null
            ? null
            : translateErrorCode(l10n, state.discountCodeErrorCode, l10n.errorDiscountCodeInvalid);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.discountCodeFieldLabel,
              style: context.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.textSecondaryOf(context),
              ),
            ),
            const SizedBox(height: AppSizes.spacingXSmall),
            if (state.hasDiscountCode)
              _AppliedCode(
                code: state.discountCode!,
                onRemove: context.read<CartCubit>().removeDiscountCode,
              )
            else
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('discountCodeInput'),
                      controller: _controller,
                      textCapitalization: TextCapitalization.characters,
                      textInputAction: TextInputAction.done,
                      // Codes read left to right even in an Arabic layout.
                      textDirection: TextDirection.ltr,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
                        LengthLimitingTextInputFormatter(8),
                        _UpperCaseFormatter(),
                      ],
                      onSubmitted: (_) => _apply(),
                      decoration: InputDecoration(
                        hintText: l10n.discountCodeHint,
                        isDense: true,
                        border: const OutlineInputBorder(borderRadius: AppRadius.medium),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSizes.spacingSmall),
                  SizedBox(
                    height: 48,
                    child: FilledButton(
                      key: const Key('discountCodeApply'),
                      onPressed: _applying ? null : _apply,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primaryOf(context),
                        foregroundColor: AppColors.onPrimaryOf(context),
                        shape: const RoundedRectangleBorder(borderRadius: AppRadius.medium),
                      ),
                      child: _applying
                          ? SizedBox(
                              width: AppSizes.iconSizeSmall,
                              height: AppSizes.iconSizeSmall,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(l10n.discountCodeApply),
                    ),
                  ),
                ],
              ),
            if (error != null) ...[
              const SizedBox(height: AppSizes.spacingXSmall),
              Text(
                error,
                key: const Key('discountCodeError'),
                style: context.textTheme.bodySmall?.copyWith(color: AppColors.errorOf(context)),
              ),
            ],
          ],
        );
      },
    );
  }
}

// The applied code, and the way to take it off. Its amount (and a retry when
// the quote failed) is in the cart summary, with the other figures.
class _AppliedCode extends StatelessWidget {
  const _AppliedCode({required this.code, required this.onRemove});

  final String code;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final positive = AppColors.secondaryOf(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingSmall + AppSizes.spacingXSmall, vertical: 6),
      decoration: BoxDecoration(
        color: positive.withValues(alpha: 0.1),
        border: Border.all(color: positive.withValues(alpha: 0.5)),
        borderRadius: AppRadius.medium,
      ),
      child: Row(
        children: [
          Icon(Icons.local_offer_outlined, size: AppSizes.iconSizeSmall + 2, color: positive),
          const SizedBox(width: AppSizes.spacingSmall),
          Expanded(
            child: Text(
              l10n.discountCodeApplied(code),
              key: const Key('discountCodeApplied'),
              style: context.textTheme.bodyMedium?.copyWith(fontWeight: AppTextTheme.semiBold),
            ),
          ),
          TextButton(
            key: const Key('discountCodeRemove'),
            onPressed: onRemove,
            style: TextButton.styleFrom(foregroundColor: AppColors.errorOf(context)),
            child: Text(l10n.discountCodeRemove),
          ),
        ],
      ),
    );
  }
}

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}
