import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feniq/core/services/pending_payment_journal.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('lost response survives restart and replays one payment with the original key', () async {
    final payload = <String, Object?>{'pharmacyId': 'p', 'amount': 3000};
    final recorded = <String>{};
    final first = PendingPaymentJournal();
    await expectLater(first.run(ownerId: 'w', payload: payload, proposedKey: 'original', send: (key) async {
      recorded.add(key); throw StateError('response lost');
    }), throwsStateError);
    final restarted = PendingPaymentJournal();
    expect((await restarted.read('another-account')), isEmpty);
    expect((await restarted.read('w')).single.key, 'original');
    await restarted.run(ownerId: 'w', payload: payload, proposedKey: 'new-key', send: (key) async { recorded.add(key); });
    expect(recorded, {'original'});
    expect(await restarted.read('w'), isEmpty);
  });
  test('concurrent duplicate confirmations send only one request', () async {
    final journal = PendingPaymentJournal(); var sends = 0;
    Future<void> send(String key) async { sends++; await Future<void>.delayed(Duration.zero); }
    await Future.wait([
      journal.run(ownerId: 'w', payload: {'amount': 100}, proposedKey: 'a', send: send),
      journal.run(ownerId: 'w', payload: {'amount': 100}, proposedKey: 'b', send: send),
    ]);
    expect(sends, 1);
  });
  test('corrupt pending storage refuses to mint another payment key', () async {
    SharedPreferences.setMockInitialValues({'payments.pending.w': 'corrupt'});
    var sent = false;
    await expectLater(PendingPaymentJournal().run(ownerId: 'w', payload: {'amount': 1}, proposedKey: 'new', send: (_) async { sent = true; }), throwsStateError);
    expect(sent, false);
  });
}
