// The rep programme's money rule (owner's decision, October 2026 - HANDOFF.md):
//
// A warehouse pays its rep a commission on the orders of the rep's pharmacies
// (the "rep commission rate", e.g. 2%). On an order that goes through Feniq
// that commission is split in four quarters:
//
//   Feniq         a QUARTER (FENIQ_SHARE) - Feniq's only cut of an order
//   the pharmacy  a QUARTER (PHARMACY_SHARE) - credit at this warehouse, taken
//                 off its next order automatically (pharmacyCredit.service.js)
//   the rep       a QUARTER (REP_SHARE)
//   the warehouse the last QUARTER - it keeps it, or gives it to the rep
//                 (rep.warehouseShareToRep, the warehouse's choice per rep)
//
// An order with no rep has no rep commission, and so no Feniq commission and
// no pharmacy credit.
const FENIQ_SHARE = 0.25;
const PHARMACY_SHARE = 0.25;
const REP_SHARE = 0.25;
const WAREHOUSE_SHARE = 0.25;

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

// The rep's own part of the rate: a quarter, or half when the warehouse gives
// the rep its quarter too.
function repShareFor(warehouseShareToRep) {
  return warehouseShareToRep ? REP_SHARE + WAREHOUSE_SHARE : REP_SHARE;
}

function repRateFor(repCommissionRate, warehouseShareToRep = false) {
  return roundRate((Number(repCommissionRate) || 0) * repShareFor(warehouseShareToRep));
}

// The four amounts, in SYP, for an order the warehouse earns `revenueSyp` on.
// `feniqAmount` is computed exactly the way the order's platform commission is
// (round(revenue x feniqRate / 100)), so the two always agree; what the
// warehouse keeps is whatever of the whole commission is left, never negative.
function splitRepCommission(revenueSyp, repCommissionRate, { warehouseShareToRep = false } = {}) {
  const rate = Number(repCommissionRate) || 0;
  const giveToRep = Boolean(warehouseShareToRep);
  if (!(rate > 0) || !(revenueSyp > 0)) {
    return {
      rate,
      warehouseShareToRep: giveToRep,
      totalAmount: 0,
      repAmount: 0,
      feniqAmount: 0,
      pharmacyAmount: 0,
      savingAmount: 0,
    };
  }
  const amountAt = (share) => Math.round((revenueSyp * roundRate(rate * share)) / 100);
  const totalAmount = Math.round((revenueSyp * rate) / 100);
  const feniqAmount = amountAt(FENIQ_SHARE);
  const pharmacyAmount = amountAt(PHARMACY_SHARE);
  const repAmount = amountAt(repShareFor(giveToRep));
  const savingAmount = Math.max(0, totalAmount - feniqAmount - pharmacyAmount - repAmount);
  return { rate, warehouseShareToRep: giveToRep, totalAmount, repAmount, feniqAmount, pharmacyAmount, savingAmount };
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
  FENIQ_SHARE,
  PHARMACY_SHARE,
  REP_SHARE,
  WAREHOUSE_SHARE,
  MAX_REP_COMMISSION_RATE,
  feniqRateFor,
  repRateFor,
  splitRepCommission,
  parseRepCommissionRate,
};
