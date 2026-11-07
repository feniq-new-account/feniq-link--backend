import 'package:flutter_test/flutter_test.dart';
import 'package:feniq/features/debts/data/models/debt_detail_model.dart';

void main() {
  StatementRowModel row(String kind, {num debit = 0, num credit = 0}) =>
      StatementRowModel(
        id: 'synthetic',
        kind: kind,
        effectiveAt: DateTime.utc(2026, 11, 7),
        debitSyp: debit,
        creditSyp: credit,
        balanceSyp: 0,
      );

  test('only posted payment credits count as cash received', () {
    expect(row('payment', credit: 5000).isCashReceipt, isTrue);
    expect(row('payment', credit: 5000).isNonCashCredit, isFalse);
    expect(row('payment', credit: 0).isCashReceipt, isFalse);
    expect(row('payment_reversal', debit: 5000).isCashReceipt, isFalse);
  });

  test('return and manual credits reduce debt but are not collections', () {
    for (final kind in ['return_credit', 'manual_credit']) {
      final credit = row(kind, credit: 2000);
      expect(credit.isNonCashCredit, isTrue, reason: kind);
      expect(credit.isCashReceipt, isFalse, reason: kind);
      expect(credit.amountSyp, 2000);
    }
    expect(row('return_credit_reversal', debit: 2000).isNonCashCredit, isFalse);
    expect(row('charge', debit: 2000).isCashReceipt, isFalse);
  });
}
