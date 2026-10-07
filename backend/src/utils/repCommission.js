// The rep programme's money rule (owner's decision, HANDOFF.md):
//
// A warehouse pays its rep a commission on the orders of the rep's pharmacies
// (the "rep commission rate", e.g. 2%). On an order that goes through Feniq
// that commission is split three ways:
//
//   the rep      takes HALF of it     (REP_SHARE)
//   Feniq        takes a QUARTER of it (FENIQ_SHARE) - Feniq's only cut of an order
//   the warehouse keeps the REST      (what it saves against paying the rep in full)
//
// An order with no rep has no rep commission and so no Feniq commission.
const REP_SHARE = 0.5;
const FENIQ_SHARE = 0.25;

// The most a rep commission rate may be, in percent. A guard against a typo
// (20 instead of 2), not a business limit.
const MAX_REP_COMMISSION_RATE = 10;

// Rates are percentages with at most two decimals ("2", "1.5", "0.75").
function roundRate(rate) {
  return Math.round(rate * 1e4) / 1e4;
}

// The part of the rep commission rate that is Feniq's, as a percentage of the
// order: 2% -> 0.5%.
function feniqRateFor(repCommissionRate) {
  return roundRate((Number(repCommissionRate) || 0) * FENIQ_SHARE);
}

// The three amounts, in SYP, for an order the warehouse earns `revenueSyp` on.
// `feniqAmount` is computed exactly the way the order's platform commission is
// (round(revenue x feniqRate / 100)), so the two always agree; the warehouse's
// saving is whatever of the whole commission is left, never negative.
function splitRepCommission(revenueSyp, repCommissionRate) {
  const rate = Number(repCommissionRate) || 0;
  if (!(rate > 0) || !(revenueSyp > 0)) {
    return { rate, totalAmount: 0, repAmount: 0, feniqAmount: 0, savingAmount: 0 };
  }
  const totalAmount = Math.round((revenueSyp * rate) / 100);
  const feniqAmount = Math.round((revenueSyp * feniqRateFor(rate)) / 100);
  const repAmount = Math.round((revenueSyp * roundRate(rate * REP_SHARE)) / 100);
  const savingAmount = Math.max(0, totalAmount - feniqAmount - repAmount);
  return { rate, totalAmount, repAmount, feniqAmount, savingAmount };
}

// Reads a rate from a request: a number (or numeric string) from 0 to the
// maximum with at most two decimals. Returns null when it is not one.
function parseRepCommissionRate(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return null;
  if (number < 0 || number > MAX_REP_COMMISSION_RATE) return null;
  if (Math.round(number * 100) / 100 !== number) return null;
  return number;
}

module.exports = {
  REP_SHARE,
  FENIQ_SHARE,
  MAX_REP_COMMISSION_RATE,
  feniqRateFor,
  splitRepCommission,
  parseRepCommissionRate,
};
