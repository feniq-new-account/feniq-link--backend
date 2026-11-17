'use strict';
// "Today's receipts" for the warehouse accountant: what came in on one
// business day (Asia/Damascus), by method and by who recorded it - the
// manager records payments too since 2026-11-17.
//
// The day's figure follows the ledger exactly (MONEY_FLOW §12: a closed day
// never changes): every payment dated that day counts on that day, even if it
// is reversed later, and a reversal counts - as a minus - on the day it is
// dated. So net = received that day - reversed that day, the same movement the
// statement and the warehouse summary show. Totals are aggregated over every
// row; only the list is capped.
//
// A payment entered today but dated earlier (paidAt in the past) belongs to
// its own day; it is listed separately so the accountant still sees it.
const mongoose = require('mongoose');
const Payment = require('../models/payment.model');
const Pharmacy = require('../models/pharmacy.model');
const User = require('../models/user.model');
const { ApiError } = require('../utils/ApiError');
const { startOfBusinessDay, endOfBusinessDay, businessDateOf } = require('../utils/businessTime');

const MAX_ROWS = 500;

function amountOf(field = '$amountSyp') {
  return { $ifNull: [field, 0] };
}

async function dailyReceipts(warehouseId, { date } = {}, now = new Date()) {
  const day = date === undefined || date === '' ? businessDateOf(now) : date;
  const from = startOfBusinessDay(day);
  const to = endOfBusinessDay(day);
  if (!from || !to) throw ApiError.badRequest('Invalid date.', undefined, 'INVALID_DATE');
  const wid = new mongoose.Types.ObjectId(String(warehouseId));
  const inDay = { warehouseId: wid, paidAt: { $gte: from, $lte: to } };

  const [byKind, byMethod, byRecorder] = await Promise.all([
    Payment.aggregate([{ $match: inDay },
      { $group: { _id: '$kind', amountSyp: { $sum: amountOf() }, count: { $sum: 1 },
        unknown: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$amountSyp', null] }, null] }, 1, 0] } } } }]),
    Payment.aggregate([{ $match: { ...inDay, kind: 'settlement' } },
      { $group: { _id: '$method', amountSyp: { $sum: amountOf() } } }]),
    Payment.aggregate([{ $match: { ...inDay, kind: 'settlement' } },
      { $group: { _id: '$recordedBy', amountSyp: { $sum: amountOf() }, count: { $sum: 1 } } },
      { $sort: { amountSyp: -1 } }]),
  ]);
  const kind = (k) => byKind.find((row) => row._id === k) || { amountSyp: 0, count: 0, unknown: 0 };
  const received = kind('settlement');
  const reversed = kind('reversal');

  const [rows, backdated] = await Promise.all([
    Payment.find(inDay).select('paymentNumber pharmacyId amountSyp method paidAt createdAt recordedBy status kind')
      .sort({ paidAt: -1, _id: -1 }).limit(MAX_ROWS + 1).lean(),
    // Entered that day, dated earlier: shown, counted on their own day.
    Payment.find({ warehouseId: wid, createdAt: { $gte: from, $lte: to }, paidAt: { $lt: from } })
      .select('paymentNumber pharmacyId amountSyp method paidAt createdAt recordedBy status kind')
      .sort({ createdAt: -1 }).limit(MAX_ROWS).lean(),
  ]);
  const truncated = rows.length > MAX_ROWS;
  const listed = rows.slice(0, MAX_ROWS);
  const everyone = [...listed, ...backdated];

  const userIds = [...new Set([...everyone.map((p) => String(p.recordedBy)), ...byRecorder.map((r) => String(r._id))])];
  const [pharmacies, users] = await Promise.all([
    Pharmacy.find({ _id: { $in: everyone.map((p) => p.pharmacyId) } }).select('nameAr nameEn').lean(),
    User.find({ _id: { $in: userIds } }).select('name role warehouseRole').lean(),
  ]);
  const pharmacyById = new Map(pharmacies.map((p) => [String(p._id), p]));
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const who = (id) => {
    const user = userById.get(String(id));
    return user ? { name: user.name, role: user.warehouseRole || 'legacy' } : null;
  };
  const row = (p) => {
    const ph = pharmacyById.get(String(p.pharmacyId));
    return { id: p._id, paymentNumber: p.paymentNumber, kind: p.kind, status: p.status, pharmacyId: p.pharmacyId,
      pharmacy: ph ? { nameAr: ph.nameAr, nameEn: ph.nameEn } : null, amountSyp: p.amountSyp ?? null,
      method: p.method, paidAt: p.paidAt, createdAt: p.createdAt, recordedBy: who(p.recordedBy) };
  };

  return {
    date: day, from, to, timezone: 'Asia/Damascus', asOf: now,
    receivedSyp: received.amountSyp, receivedCount: received.count,
    reversedSyp: reversed.amountSyp, reversedCount: reversed.count,
    netSyp: received.amountSyp - reversed.amountSyp,
    // Old rows with no SYP amount: counted as payments, not in the sums.
    unknownAmountCount: received.unknown + reversed.unknown,
    byMethod: Object.fromEntries(byMethod.map((m) => [m._id, m.amountSyp])),
    byRecorder: byRecorder.map((r) => ({ userId: String(r._id), ...(who(r._id) || { name: null, role: null }),
      amountSyp: r.amountSyp, count: r.count })),
    payments: listed.map(row), truncated,
    enteredTodayDatedEarlier: backdated.map(row),
  };
}

module.exports = { dailyReceipts, MAX_ROWS };
