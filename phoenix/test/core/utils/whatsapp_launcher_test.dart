import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/core/utils/whatsapp_launcher.dart';

void main() {
  test('the manual recovery and pending approval WhatsApp uses the owner number', () {
    expect(supportWhatsAppPhone, '+963938456457');
    expect(normalizeSyrianPhoneForWhatsApp(supportWhatsAppPhone), '963938456457');
    expect(normalizeSyrianPhoneForWhatsApp('0938456457'), '963938456457');
  });
}
