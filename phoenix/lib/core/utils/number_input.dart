import 'package:flutter/services.dart';

String westernDigits(String text) => text.split('').map((c) {
  final value = c.codeUnitAt(0);
  if (value >= 0x0660 && value <= 0x0669) return '${value - 0x0660}';
  if (value >= 0x06f0 && value <= 0x06f9) return '${value - 0x06f0}';
  return c == '٫'
      ? '.'
      : c == '٬'
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
