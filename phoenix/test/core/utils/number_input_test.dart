import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/utils/number_input.dart';
import 'package:feniq/core/utils/currency_formatter.dart';
import 'package:feniq/core/utils/date_formatter.dart';

void main() {
  setUpAll(() => initializeDateFormatting());
  test('Arabic and Persian keyboards keep numeric input and cursor positions', () {
    const input = TextEditingValue(text: '+٩٦٣ ۱۲۳٫٤٥', selection: TextSelection.collapsed(offset: 10));
    final output = const WesternDigitsFormatter().formatEditUpdate(TextEditingValue.empty, input);
    expect(output.text, '+963 123.45');
    expect(output.selection, input.selection);
    expect(westernDigits('١٬٢٣٤'), '1,234');
  });
  test('Arabic negative amounts and dates keep a left-to-right numeric run', () {
    expect(formatSyp(-1254400, 'ل.س'), contains('\u2066-1,254,400\u2069'));
    expect(DateFormatter.formatDateTime(DateTime(2026, 10, 28, 8, 35), locale: 'ar'), '\u20662026/10/28 08:35\u2069');
  });
}
