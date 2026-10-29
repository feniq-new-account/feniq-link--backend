// The warehouse's loyalty discount (owner's decision, October 2026): a fixed
// amount off an order, by how big the order is, on tiers the warehouse sets
// itself - e.g. 100,000 SYP or more -> 2,000 off, 200,000 or more -> 5,000 off.
// Off unless the warehouse switches it on. The warehouse pays for it (it is
// money off what the pharmacy owes the warehouse); Feniq's commission is taken
// on what is left.

// A sane cap on the number of tiers a warehouse keeps.
const MAX_LOYALTY_TIERS = 10;

// The discount for an order worth `amountSyp`: the tier with the highest
// threshold the order reaches, never more than the order itself. 0 below the
// lowest tier, or with no tiers.
function loyaltyDiscountFor(amountSyp, tiers) {
  if (!(amountSyp > 0) || !Array.isArray(tiers) || tiers.length === 0) return { discountSyp: 0, tier: null };
  let best = null;
  for (const tier of tiers) {
    if (tier && tier.minSyp > 0 && tier.discountSyp > 0 && amountSyp >= tier.minSyp) {
      if (!best || tier.minSyp > best.minSyp) best = tier;
    }
  }
  if (!best) return { discountSyp: 0, tier: null };
  return {
    discountSyp: Math.min(Math.round(best.discountSyp), amountSyp),
    tier: { minSyp: best.minSyp, discountSyp: best.discountSyp },
  };
}

// The tiers in effect for a warehouse: none unless it switched loyalty on.
function activeLoyaltyTiers(warehouse) {
  const loyalty = warehouse?.loyalty;
  if (!loyalty || !loyalty.enabled || !Array.isArray(loyalty.tiers)) return [];
  return loyalty.tiers.map((tier) => ({ minSyp: tier.minSyp, discountSyp: tier.discountSyp }));
}

// Reads tiers from a request: whole liras, a threshold above zero, a discount
// above zero and below its threshold, no two tiers on the same threshold.
// Returns the tiers sorted by threshold, or null when any is invalid.
function parseLoyaltyTiers(value) {
  if (!Array.isArray(value) || value.length > MAX_LOYALTY_TIERS) return null;
  const tiers = [];
  for (const raw of value) {
    const minSyp = Number(raw?.minSyp);
    const discountSyp = Number(raw?.discountSyp);
    if (!Number.isSafeInteger(minSyp) || !Number.isSafeInteger(discountSyp)) return null;
    if (minSyp <= 0 || discountSyp <= 0 || discountSyp >= minSyp) return null;
    tiers.push({ minSyp, discountSyp });
  }
  tiers.sort((a, b) => a.minSyp - b.minSyp);
  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i].minSyp === tiers[i - 1].minSyp) return null;
  }
  return tiers;
}

module.exports = { MAX_LOYALTY_TIERS, loyaltyDiscountFor, activeLoyaltyTiers, parseLoyaltyTiers };
