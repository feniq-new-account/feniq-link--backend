import { parseWholeLiras } from './collectPayment';
// Pure helpers for the warehouse's loyalty discount card (LoyaltySettingsCard).
// Mirrors backend/src/utils/loyalty.js's parseLoyaltyTiers so the form says
// what is wrong before the round trip; the server still has the last word.

export const MAX_LOYALTY_TIERS = 10;

// "100,000" / "100000" / " 100 000 " -> 100000; anything else -> NaN.
export function parseSyp(text) {
  return parseWholeLiras(text) ?? NaN;
}

// The tiers as typed -> [{ minSyp, discountSyp }] sorted by minimum, or
// { error } with a translation key. Empty rows are ignored.
export function readTiers(rows, { enabled }) {
  const tiers = [];
  for (const row of rows) {
    if (String(row.minSyp ?? '').trim() === '' && String(row.discountSyp ?? '').trim() === '') continue;
    const minSyp = parseSyp(row.minSyp);
    const discountSyp = parseSyp(row.discountSyp);
    if (!Number.isSafeInteger(minSyp) || !Number.isSafeInteger(discountSyp) || !(minSyp > 0) || !(discountSyp > 0) || discountSyp >= minSyp) {
      return { error: 'warehouseSettings.loyalty.errorTier' };
    }
    tiers.push({ minSyp, discountSyp });
  }
  tiers.sort((a, b) => a.minSyp - b.minSyp);
  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i].minSyp === tiers[i - 1].minSyp) return { error: 'warehouseSettings.loyalty.errorTier' };
  }
  if (tiers.length > MAX_LOYALTY_TIERS) return { error: 'warehouseSettings.loyalty.errorTier' };
  if (enabled && tiers.length === 0) return { error: 'warehouseSettings.loyalty.errorEmpty' };
  return { tiers };
}

// Stored tiers -> editable rows (strings), with one empty row to type into
// when there are none.
export function tiersToRows(tiers) {
  const rows = (tiers ?? []).map((tier) => ({ minSyp: String(tier.minSyp), discountSyp: String(tier.discountSyp) }));
  return rows.length > 0 ? rows : [{ minSyp: '', discountSyp: '' }];
}
