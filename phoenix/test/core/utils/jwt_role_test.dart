import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/utils/jwt_role.dart';

String _jwt(Map<String, dynamic> payload) {
  String part(Object value) => base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${part({'alg': 'HS256', 'typ': 'JWT'})}.${part(payload)}.signature';
}

void main() {
  group('roleFromJwt', () {
    test('reads the role claim', () {
      expect(roleFromJwt(_jwt({'sub': 'u1', 'role': 'rep', 'tokenVersion': 0})), 'rep');
      expect(roleFromJwt(_jwt({'role': 'pharmacy'})), 'pharmacy');
    });

    test('handles a payload whose length needs base64 padding and non-ASCII text', () {
      expect(roleFromJwt(_jwt({'role': 'rep', 'name': 'أحمد'})), 'rep');
    });

    test('null for no token, a non-JWT, a payload that is not JSON, or no role', () {
      expect(roleFromJwt(null), isNull);
      expect(roleFromJwt(''), isNull);
      expect(roleFromJwt('not-a-jwt'), isNull);
      expect(roleFromJwt('a.b.c'), isNull);
      expect(roleFromJwt(_jwt({'sub': 'u1'})), isNull);
      expect(roleFromJwt(_jwt({'role': 7})), isNull);
      expect(roleFromJwt(_jwt({'role': ''})), isNull);
    });
  });
}
