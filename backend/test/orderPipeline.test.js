// The manager's "today's orders": open orders by step, delivered today
// (Damascus business day), and pending orders older than 48 hours.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-order-pipeline-pad';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const Order = require('../src/models/order.model');
const { orderPipeline } = require('../src/services/orderPipeline.service');

const warehouseId = new mongoose.Types.ObjectId();
// 10:00 Damascus on 20 Nov 2026 = 07:00 UTC.
const NOW = new Date('2026-11-20T07:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600 * 1000);

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-order-pipeline' });
  let n = 0;
  const order = (status, over = {}) => ({
    orderNumber: ++n, warehouseId, pharmacyId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
    status, finalPrice: 1000 * n, createdAt: hoursAgo(1), ...over,
  });
  await Order.collection.insertMany([
    order('pending'),
    order('pending', { createdAt: hoursAgo(49) }), // stale
    order('confirmed'),
    order('preparing'),
    order('out_for_delivery'),
    order('delivered', { deliveredAt: hoursAgo(2) }), // today 08:00 Damascus
    order('delivered', { deliveredAt: new Date('2026-11-19T20:30:00Z') }), // 23:30 Damascus yesterday
    order('delivered', { deliveredAt: new Date('2026-11-19T21:30:00Z') }), // 00:30 Damascus today
    order('cancelled'),
    order('pending', { warehouseId: new mongoose.Types.ObjectId() }), // another warehouse
  ]);
});
test.after(stopMemoryMongo);

test("today's orders: open by step, delivered on the Damascus day, stale pending", async () => {
  const p = await orderPipeline(warehouseId, NOW);
  assert.equal(p.date, '2026-11-20');
  assert.deepEqual(p.pending, { count: 2, amountSyp: 1000 + 2000 });
  assert.deepEqual(p.accepted, { count: 2, amountSyp: 3000 + 4000 });
  assert.deepEqual(p.onTheWay, { count: 1, amountSyp: 5000 });
  assert.deepEqual(p.deliveredToday, { count: 2, amountSyp: 6000 + 8000 });
  assert.equal(p.stalePendingCount, 1);
});

test('an empty warehouse reads as zeros, never missing', async () => {
  const p = await orderPipeline(new mongoose.Types.ObjectId(), NOW);
  for (const key of ['pending', 'accepted', 'onTheWay', 'deliveredToday']) assert.deepEqual(p[key], { count: 0, amountSyp: 0 });
  assert.equal(p.stalePendingCount, 0);
});
