/// What the cart costs right now, as the server quoted it
/// (POST /discount-codes/preview). Every figure is whole lira, priced by the
/// same code the order itself is charged with, so the cart's summary lines add
/// up to exactly what the order will cost. The cart is quoted with or without
/// a discount code: the pharmacist always sees the real total.
///
/// The discount code comes off LAST - after the offers, the manufacturer
/// discounts, the package prices and the platform discount
/// (`platformDiscountSyp`).
///
/// With a code, [revision] goes back with the order: if the code's amount
/// changed in between, the server refuses with DISCOUNT_CODE_CHANGED instead
/// of charging a total the pharmacist never saw.
class CartQuote {
  const CartQuote({
    this.code,
    this.type,
    this.value,
    this.revision,
    required this.subtotalSyp,
    required this.platformDiscountSyp,
    this.loyaltyDiscountSyp = 0,
    this.creditBalanceSyp = 0,
    this.creditUsedSyp = 0,
    required this.preCodeSyp,
    this.discountSyp = 0,
    required this.finalSyp,
    this.usdToSyp,
  });

  /// The discount code as the server stores it (upper case), or null when the
  /// cart was quoted without one - as are [type], [value] and [revision].
  final String? code;

  /// 'percentage' or 'fixed'.
  final String? type;

  /// A percentage, or a fixed amount in lira.
  final num? value;
  final int? revision;

  final int subtotalSyp;
  final int platformDiscountSyp;

  /// The warehouse's loyalty discount for a cart this size (its own tiers);
  /// 0 when it has none or the cart is below them.
  final int loyaltyDiscountSyp;

  /// The pharmacy's credit at this warehouse - its share of earlier orders'
  /// rep commission - and the part of it this order takes automatically.
  final int creditBalanceSyp;
  final int creditUsedSyp;

  final int preCodeSyp;

  /// What the code takes off; 0 without one.
  final int discountSyp;
  final int finalSyp;

  /// The rate the server priced this quote at - the rate the totals on screen
  /// were converted with, so it is what the order sends as rateUsed.
  final double? usdToSyp;

  bool get hasCode => code != null;

  static int _int(Object? value) => (value as num?)?.round() ?? 0;

  factory CartQuote.fromJson(Map<String, dynamic> json) {
    final code = json['discountCode'] as Map<String, dynamic>?;
    final totals = json['totals'] as Map<String, dynamic>;
    return CartQuote(
      code: code?['code'] as String?,
      type: code?['type'] as String?,
      value: code?['value'] as num?,
      revision: (code?['revision'] as num?)?.toInt(),
      subtotalSyp: _int(totals['subtotalSyp']),
      platformDiscountSyp: _int(totals['platformDiscountSyp']),
      loyaltyDiscountSyp: _int(totals['loyaltyDiscountSyp']),
      creditBalanceSyp: _int(totals['creditBalanceSyp']),
      creditUsedSyp: _int(totals['creditUsedSyp']),
      preCodeSyp: _int(totals['preCodeSyp']),
      discountSyp: _int(totals['discountSyp']),
      finalSyp: _int(totals['finalSyp']),
      usdToSyp: (totals['usdToSyp'] as num?)?.toDouble(),
    );
  }
}
