import 'package:feniq/core/utils/number_input.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../constants/app_colors.dart';
import '../constants/app_padding.dart';
import '../constants/app_radius.dart';
import '../constants/app_sizes.dart';
import '../extensions/build_context_extensions.dart';

/// A single, editable Syrian phone number field shared by registration and
/// password login. The user may enter 09..., 9..., 9639..., or +9639...
/// (including a redundant zero after 963). No prefix is displayed separately.
class PhoneTextField extends StatelessWidget {
  const PhoneTextField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
    this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: context.textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondaryOf(context),
          ),
        ),
        const SizedBox(height: AppSizes.spacingXSmall),
        TextFormField(
          controller: controller,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          inputFormatters: [
            const WesternDigitsFormatter(),
            FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s()\-]')),
          ],
          validator: validator,
          onChanged: onChanged,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.left,
          style: context.textTheme.bodyMedium,
          decoration: InputDecoration(
            hintText: '09xxxxxxxx / +9639xxxxxxxx',
            hintStyle: context.textTheme.bodyMedium?.copyWith(
              color: AppColors.textSecondaryOf(context).withValues(alpha: 0.7),
            ),
            isDense: true,
            contentPadding: AppPadding.input,
            constraints: const BoxConstraints(minHeight: AppSizes.inputHeight),
            filled: true,
            fillColor: AppColors.surfaceOf(context),
            border: OutlineInputBorder(
              borderRadius: AppRadius.small,
              borderSide: BorderSide(color: AppColors.borderOf(context)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: AppRadius.small,
              borderSide: BorderSide(color: AppColors.borderOf(context)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: AppRadius.small,
              borderSide: BorderSide(color: AppColors.primaryOf(context), width: 1.5),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: AppRadius.small,
              borderSide: BorderSide(color: AppColors.errorOf(context)),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: AppRadius.small,
              borderSide: BorderSide(color: AppColors.errorOf(context), width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}

/// Existing helper retained for compatibility with prior tests and callers.
/// Never prepends an implicit "09": eight bare digits are not a full phone.
String phoneTextFieldSubscriberDigits(String fieldValue) {
  final normalized = phoneTextFieldFullValue(fieldValue);
  if (RegExp(r'^\+9639\d{8}$').hasMatch(normalized)) {
    return normalized.substring(5);
  }
  return westernDigits(fieldValue).replaceAll(RegExp(r'\D'), '');
}

/// Normalize common Syrian mobile spellings to the same backend identifier.
/// Unsupported lengths/prefixes pass through for Validators.validatePhone to
/// reject; never truncate or silently turn a malformed number into an account.
String phoneTextFieldFullValue(String fieldValue) {
  final original = westernDigits(fieldValue).trim().replaceAll(RegExp(r'[\s()\-]'), '');
  var digits = original;
  if (digits.isEmpty) return '';
  if (digits.startsWith('+')) {
    digits = digits.substring(1);
  } else if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }

  String? mobile;
  if (RegExp(r'^09\d{8}$').hasMatch(digits)) {
    mobile = digits.substring(1);
  } else if (RegExp(r'^9\d{8}$').hasMatch(digits)) {
    mobile = digits;
  } else if (RegExp(r'^96309\d{8}$').hasMatch(digits)) {
    mobile = digits.substring(4);
  } else if (RegExp(r'^9639\d{8}$').hasMatch(digits)) {
    mobile = digits.substring(3);
  }

  return mobile == null ? original : '+963$mobile';
}
