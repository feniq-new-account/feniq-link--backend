const { toWesternDigits } = require('./normalizeText');

// Bonus tiers ("بونص"): buy N units, get M more free. Stored on the warehouse
// product as [{ buy, free }] (product.model.js). A bonus is NOT an Offer - no
// admin approval, no link to the offer rules.
//
// Parsing (the import's bonus column - which warehouses often head "العرض" -
// and the manual product form):
//  - one or more tiers, separated by ، , ; / | or a newline;
//  - a tier is two integers joined by + (or :), optional spaces, optional
//    words around it such as "بونص" / "bonus"; Arabic-Indic digits allowed;
//  - the SMALLER number is always the free quantity: 10+1 and 1+10 are both
//    {buy:10, free:1};
//  - 0, -, "لا يوجد" or an empty value mean "no bonus" (an empty list);
//  - anything else is invalid - the caller never saves a guess (the import
//    sends the row to review).

const NO_BONUS = new Set(['', '0', '-', 'لا يوجد', 'لايوجد', 'none', 'no']);
const TIER_SEPARATORS = /[،,;/|\n\r]+/;
// With or without the article: "بونص" / "البونص", "عرض" / "العرض".
const FILLER_WORDS = /(ال)?(بونص|هديه|هدية|عرض)|bonus|free/gi;
const TIER_PATTERN = /^(\d+)\s*[+:]\s*(\d+)$/;

function parseBonus(value) {
  if (value === undefined || value === null) return { ok: true, tiers: [] };
  const text = toWesternDigits(String(value)).trim().toLowerCase();
  if (NO_BONUS.has(text)) return { ok: true, tiers: [] };

  const tiers = [];
  for (const part of text.split(TIER_SEPARATORS)) {
    const cleaned = part.replace(FILLER_WORDS, '').trim();
    if (!cleaned) continue;
    const match = cleaned.match(TIER_PATTERN);
    if (!match) return { ok: false, tiers: [] };
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) return { ok: false, tiers: [] };
    tiers.push({ buy: Math.max(a, b), free: Math.min(a, b) });
  }
  if (tiers.length === 0) return { ok: false, tiers: [] };

  // One tier per `buy` threshold (the last one given wins), lowest first.
  const byBuy = new Map();
  for (const tier of tiers) byBuy.set(tier.buy, tier);
  return { ok: true, tiers: [...byBuy.values()].sort((x, y) => x.buy - y.buy) };
}

// Validates tiers sent as structured data (the web form / an API client) -
// the same rules the text parser enforces.
function normalizeBonusTiers(input) {
  if (input === undefined) return { ok: true, tiers: undefined };
  if (input === null) return { ok: true, tiers: [] };
  if (typeof input === 'string') return parseBonus(input);
  if (!Array.isArray(input)) return { ok: false, tiers: [] };
  const tiers = [];
  for (const tier of input) {
    const buy = Number(tier?.buy);
    const free = Number(tier?.free);
    if (!Number.isInteger(buy) || !Number.isInteger(free) || buy < 1 || free < 1) return { ok: false, tiers: [] };
    tiers.push({ buy: Math.max(buy, free), free: Math.min(buy, free) });
  }
  const byBuy = new Map();
  for (const tier of tiers) byBuy.set(tier.buy, tier);
  return { ok: true, tiers: [...byBuy.values()].sort((x, y) => x.buy - y.buy) };
}

// The free quantity an order line earns (catalog overhaul §8.3): the highest
// tier whose `buy` is <= the ordered quantity, then
// floor(quantity / tier.buy) * tier.free.
//   [10+1], qty 25          -> 2 free
//   [10+1, 20+3], qty 45    -> tier 20+3 -> floor(45/20)=2 -> 6 free
// Returns { freeQuantity, tier } (tier null when none applies).
function freeQuantityFor(tiers, quantity) {
  if (!Array.isArray(tiers) || tiers.length === 0 || !(quantity > 0)) return { freeQuantity: 0, tier: null };
  let best = null;
  for (const tier of tiers) {
    if (tier.buy <= quantity && (!best || tier.buy > best.buy)) best = tier;
  }
  if (!best) return { freeQuantity: 0, tier: null };
  return { freeQuantity: Math.floor(quantity / best.buy) * best.free, tier: { buy: best.buy, free: best.free } };
}

// The bonus a product earns right now: a running bonus offer's tiers replace
// the product's own (the price stays as it is); otherwise the product's.
function effectiveBonuses(product, offer) {
  if (offer && offer.offerType === 'bonus' && Array.isArray(offer.bonuses) && offer.bonuses.length > 0) {
    return offer.bonuses.map((tier) => ({ buy: tier.buy, free: tier.free }));
  }
  return (product?.bonuses ?? []).map((tier) => ({ buy: tier.buy, free: tier.free }));
}

// "بونص 10+1، 20+3" - how a bonus is displayed.
function formatBonus(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return '';
  return tiers.map((tier) => `${tier.buy}+${tier.free}`).join('، ');
}

function sameBonus(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (left.length !== right.length) return false;
  const key = (tiers) => tiers.map((t) => `${Number(t.buy)}+${Number(t.free)}`).sort().join('|');
  return key(left) === key(right);
}

module.exports = {
  effectiveBonuses, parseBonus, normalizeBonusTiers, freeQuantityFor, formatBonus, sameBonus };
