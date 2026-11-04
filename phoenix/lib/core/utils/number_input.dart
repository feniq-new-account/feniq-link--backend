import 'package:flutter/services.dart';

String westernDigits(String text) => text.split('').map((c) {
  final value = c.codeUnitAt(0);
  if (value >= 0x0660 && value <= 0x0669) return '${value - 0x0660}';
  if (value >= 0x06f0 && value <= 0x06f9) return '${value - 0x06f0}';
  return c == '٫'
      ? '.'
      : (c == '٬' || c == '،')
      ? ','
      : c;
}).join();

/// Normalization preserves selection/composition offsets (one code unit in,
/// one code unit out), and happens before an ASCII numeric filter.
class WesternDigitsFormatter extends TextInputFormatter {
  const WesternDigitsFormatter();
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.copyWith(text: westernDigits(newValue.text));
}

/// Reject fractional/ambiguous amounts instead of silently deleting a decimal
/// separator ("10.5" must never turn into "105"). Grouping is accepted only
/// as complete groups of three; a phone number uses its separate parser.
int? parseWholeLirasInput(String text) {
  final value = westernDigits(text).trim().replaceAll(RegExp(r'\s+'), ' ');
  if (!RegExp(r'^(?:[0-9]+|[1-9][0-9]{0,2}(?:[, ][0-9]{3})+)$').hasMatch(value)) return null;
  final parsed = int.tryParse(value.replaceAll(RegExp(r'[, ]'), ''));
  return parsed != null && parsed <= 9007199254740991 ? parsed : null;
}

/// Reject an overlong paste as a whole; truncation could change the amount.
class RejectOverlongInputFormatter extends TextInputFormatter {
  const RejectOverlongInputFormatter(this.maxLength);
  final int maxLength;
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.text.length > maxLength ? oldValue : newValue;
}
