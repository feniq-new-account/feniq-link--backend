import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/warehouse/presentation/utils/voice_payment_parser.dart';

// The same lines the web panel's parser is tested against
// (web/src/utils/voicePayment.test.js): the two must agree on every one.
void main() {
  final cases = jsonDecode(File('../tools/voice-payment/cases.json').readAsStringSync()) as Map<String, dynamic>;

  group('parseVoicePayment', () {
    for (final c in (cases['parse'] as List).cast<Map<String, dynamic>>()) {
      test('reads "${c['say']}"', () {
        final r = parseVoicePayment(c['say'] as String);
        expect(r.name, c['name']);
        expect(r.kind, c['kind']);
        expect(r.paid, c['paid']);
        expect(r.left, c['left']);
      });
    }
  });

  group('matchPharmacies', () {
    final accounts = [
      for (final a in (cases['accounts'] as List).cast<Map<String, dynamic>>())
        (id: a['id'] as String, nameAr: a['nameAr'] as String, nameEn: a['nameEn'] as String),
    ];
    for (final c in (cases['match'] as List).cast<Map<String, dynamic>>()) {
      test('"${c['name']}" -> ${c['best']}', () {
        final found = matchPharmacies(c['name'] as String?, accounts);
        expect(found.isEmpty ? null : found.first.id, c['best']);
        expect(found.length, lessThanOrEqualTo(3));
      });
    }
  });

  group('paymentFor', () {
    test('takes the sum said and what is left after it', () {
      final r = paymentFor(const VoicePayment(kind: 'amount', paid: 40000), 100000)!;
      expect((r.paid, r.left), (40000, 60000));
    });
    test('a sum above what is owed is refused', () {
      expect(paymentFor(const VoicePayment(kind: 'amount', paid: 150000), 100000), isNull);
      expect(paymentFor(const VoicePayment(kind: 'amount', paid: 100000), 100000)!.left, 0);
    });
    test('"all" pays the balance, but only when something is owed', () {
      expect(paymentFor(const VoicePayment(kind: 'full'), 100000)!.paid, 100000);
      expect(paymentFor(const VoicePayment(kind: 'full'), 0), isNull);
    });
    test('"left X" pays the difference, but only when X is below the balance', () {
      final r = paymentFor(const VoicePayment(kind: 'left', left: 30000), 100000)!;
      expect((r.paid, r.left), (70000, 30000));
      expect(paymentFor(const VoicePayment(kind: 'left', left: 130000), 100000), isNull);
    });
    test('an unclear sentence records nothing', () {
      expect(paymentFor(const VoicePayment(kind: 'unknown'), 100000), isNull);
    });
  });

  test('normalizeSpeech folds digits and letter variants', () {
    expect(normalizeSpeech('٥٠،٠٠٠ أمل'), '50000 امل');
    expect(normalizeSpeech('الصَّيدلِيَّة'), 'الصيدليه');
  });
}
