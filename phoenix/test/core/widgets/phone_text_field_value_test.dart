import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/utils/validators.dart';
import 'package:feniq/core/widgets/phone_text_field.dart';

void main() {
  const canonical = '+963912345678';
  const accepted = [
    '0912345678',
    '912345678',
    '963912345678',
    '+963912345678',
    '9630912345678',
    '+9630912345678',
    '00963912345678',
    '09 1234 5678',
    '+963 912 345 678',
    '963-912-345-678',
    '٠٩١٢٣٤٥٦٧٨',
    '۰۹۱۲۳۴۵۶۷۸',
  ];

  group('phoneTextFieldFullValue', () {
    for (final input in accepted) {
      test('normalizes $input to the same account', () {
        expect(phoneTextFieldFullValue(input), canonical);
        expect(
          Validators.validatePhone(
            phoneTextFieldFullValue(input),
            requiredMessage: 'Required',
            invalidMessage: 'Invalid',
          ),
          isNull,
        );
        expect(phoneTextFieldSubscriberDigits(input), '12345678');
      });
    }

    test('empty input stays required', () {
      expect(phoneTextFieldFullValue(''), '');
      expect(Validators.validatePhone(
        phoneTextFieldFullValue(''),
        requiredMessage: 'Required',
        invalidMessage: 'Invalid',
      ), 'Required');
    });

    for (final input in [
      '12345678', // no more implicit 09 prefix
      '123',
      '123456789012345',
      '++963912345678',
      '0963912345678',
      '+963812345678',
    ]) {
      test('malformed $input cannot silently authenticate as another account', () {
        expect(
          Validators.validatePhone(
            phoneTextFieldFullValue(input),
            requiredMessage: 'Required',
            invalidMessage: 'Invalid',
          ),
          'Invalid',
        );
      });
    }
  });
}
