/// What a discount code takes off the cart right now, as the server quoted it
/// (POST /discount-codes/preview). Every figure is whole lira, priced by the
/// same code the order itself is charged with, so the cart's summary lines add
/// up to exactly what the order will cost.
///
/// The code comes off LAST - after the offers, the manufacturer discounts, the
/// package prices and the platform discount (`platformDiscountSyp`) - which is
/// why the cart shows the platform discount line only once a code is applied:
/// it is part of the arithmetic the code is taken from.
///
/// [revision] goes back with the order: if the code's amount changed in
/// between, the server refuses with DISCOUNT_CODE_CHANGED instead of charging
/// a total the pharmacist never saw.
class DiscountCodeQuote {
  const DiscountCodeQuote({
    required this.code,
    required this.type,
    required this.value,
    required this.revision,
    required this.subtotalSyp,
    required this.platformDiscountSyp,
    required this.preCodeSyp,
    required this.discountSyp,
    required this.finalSyp,
  });

  /// As the server stores it: upper case, no spaces.
  final String code;

  /// 'percentage' or 'fixed'.
  final String type;

  /// A percentage, or a fixed amount in lira.
  final num value;
  final int revision;

  final int subtotalSyp;
  final int platformDiscountSyp;
  final int preCodeSyp;
  final int discountSyp;
  final int finalSyp;

  bool get isPercentage => type == 'percentage';

  static int _int(Object? value) => (value as num?)?.round() ?? 0;

  factory DiscountCodeQuote.fromJson(Map<String, dynamic> json) {
    final code = json['discountCode'] as Map<String, dynamic>;
    final totals = json['totals'] as Map<String, dynamic>;
    return DiscountCodeQuote(
      code: code['code'] as String,
      type: code['type'] as String,
      value: code['value'] as num,
      revision: (code['revision'] as num).toInt(),
      subtotalSyp: _int(totals['subtotalSyp']),
      platformDiscountSyp: _int(totals['platformDiscountSyp']),
      preCodeSyp: _int(totals['preCodeSyp']),
      discountSyp: _int(totals['discountSyp']),
      finalSyp: _int(totals['finalSyp']),
    );
  }
}
