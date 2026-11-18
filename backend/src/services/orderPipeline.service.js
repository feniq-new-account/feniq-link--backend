'use strict';
// "Today's orders" for the manager: where the warehouse's open orders stand
// right now, and how many were delivered today (Asia/Damascus business day).
// Read-only counts and order totals; no money is moved or derived here.
const mongoose = require('mongoose');
const Order = require('../models/order.model');
const { startOfBusinessDay, endOfBusinessDay, businessDateOf } = require('../utils/businessTime');

const STALE_PENDING_MS = 48 * 60 * 60 * 1000;
const OPEN = ['pending', 'confirmed', 'preparing', 'out_for_delivery'];

async function orderPipeline(warehouseId, now = new Date()) {
  const wid = new mongoose.Types.ObjectId(String(warehouseId));
  const date = businessDateOf(now);
  const from = startOfBusinessDay(date);
  const to = endOfBusinessDay(date);
  const [open, delivered, stalePending] = await Promise.all([
    Order.aggregate([
      { $match: { warehouseId: wid, status: { $in: OPEN } } },
      { $group: { _id: '$status', count: { $sum: 1 }, amountSyp: { $sum: { $ifNull: ['$finalPrice', 0] } } } },
    ]),
    Order.aggregate([
      { $match: { warehouseId: wid, status: 'delivered', deliveredAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, count: { $sum: 1 }, amountSyp: { $sum: { $ifNull: ['$finalPrice', 0] } } } },
    ]),
    Order.countDocuments({ warehouseId: wid, status: 'pending', createdAt: { $lt: new Date(now.getTime() - STALE_PENDING_MS) } }),
  ]);
  const stage = (...statuses) => open
    .filter((row) => statuses.includes(row._id))
    .reduce((sum, row) => ({ count: sum.count + row.count, amountSyp: sum.amountSyp + row.amountSyp }), { count: 0, amountSyp: 0 });
  return {
    date, timezone: 'Asia/Damascus', asOf: now,
    pending: stage('pending'),
    // Accepted and being prepared are one step for the manager.
    accepted: stage('confirmed', 'preparing'),
    onTheWay: stage('out_for_delivery'),
    deliveredToday: { count: delivered[0]?.count ?? 0, amountSyp: delivered[0]?.amountSyp ?? 0 },
    stalePendingCount: stalePending,
  };
}

module.exports = { orderPipeline, STALE_PENDING_MS };
