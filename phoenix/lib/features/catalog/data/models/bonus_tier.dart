/// One bonus tier on a warehouse product ("بونص 10+1"): buy [buy] units, get
/// [free] more at no charge. Not an offer - no admin approval involved. The
/// free quantity an order earns is worked out by the server (the highest tier
/// whose `buy` is reached, times how many whole `buy`s the quantity holds).
class BonusTier {
  const BonusTier({required this.buy, required this.free});

  final int buy;
  final int free;

  factory BonusTier.fromJson(Map<String, dynamic> json) =>
      BonusTier(buy: (json['buy'] as num).toInt(), free: (json['free'] as num).toInt());

  Map<String, dynamic> toJson() => {'buy': buy, 'free': free};

  @override
  bool operator ==(Object other) => other is BonusTier && other.buy == buy && other.free == free;

  @override
  int get hashCode => Object.hash(buy, free);

  /// A missing / malformed list reads as "no bonus" - never a crash.
  static List<BonusTier> listFromJson(Object? json) {
    if (json is! List) return const [];
    return [
      for (final entry in json)
        if (entry is Map<String, dynamic> && entry['buy'] is num && entry['free'] is num) BonusTier.fromJson(entry),
    ];
  }

  /// "10+1، 20+3".
  static String format(List<BonusTier> tiers) => tiers.map((t) => '${t.buy}+${t.free}').join('، ');

  /// The same free-quantity rule the server applies (so the cart can show it
  /// before ordering): the highest tier whose `buy` <= [quantity], then
  /// floor(quantity / buy) * free.
  static int freeQuantity(List<BonusTier> tiers, int quantity) {
    BonusTier? best;
    for (final tier in tiers) {
      if (tier.buy <= quantity && (best == null || tier.buy > best.buy)) best = tier;
    }
    if (best == null) return 0;
    return (quantity ~/ best.buy) * best.free;
  }
}
