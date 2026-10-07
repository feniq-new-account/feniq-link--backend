import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/rep/data/visit_code.dart';

void main() {
  group('looksLikeVisitCode', () {
    test('accepts the QR text a pharmacy shows', () {
      expect(looksLikeVisitCode('FENIQ-VISIT:ABCDEFGHJKMNPQRS'), isTrue);
      expect(looksLikeVisitCode('  feniq-visit:abcdefghjkmnpqrs \n'), isTrue);
    });

    test('rejects any other QR code, an empty code and nothing', () {
      expect(looksLikeVisitCode('https://example.com'), isFalse);
      expect(looksLikeVisitCode('ABCDEFGHJKMNPQRS'), isFalse);
      expect(looksLikeVisitCode('FENIQ-VISIT:'), isFalse);
      expect(looksLikeVisitCode(''), isFalse);
      expect(looksLikeVisitCode(null), isFalse);
    });
  });
}
