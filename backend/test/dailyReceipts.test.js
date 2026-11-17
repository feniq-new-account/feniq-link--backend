// The accountant's "today's receipts": one Damascus business day's payments,
// totalled by method and by who recorded them (manager or accountant).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-daily-receipts-pad';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const Payment = require('../src/models/payment.model');
const Pharmacy = require('../src/models/pharmacy.model');
const User = require('../src/models/user.model');
const { dailyReceipts } = require('../src/services/dailyReceipts.service');

const ids = {};
// 10:00 Damascus on 20 Nov 2026 = 07:00 UTC.
const NOW = new Date('2026-11-20T07:00:00Z');

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-daily-receipts' });
  const [manager, accountant, pu] = await User.create([
    { name: 'Manager', phone: '0941000401', role: 'warehouse', warehouseRole: 'owner', status: 'active' },
    { name: 'Accountant', phone: '0941000402', role: 'warehouse', warehouseRole: 'accountant', status: 'active' },
    { name: 'Ph', phone: '0931000401', role: 'pharmacy', status: 'active' },
  ]);
  const ph = await Pharmacy.create({ userId: pu._id, nameAr: 'صيدلية النور', nameEn: 'Al Nour', ownerName: 'O',
    address: 'a', city: 'Latakia', areaType: 'city', phone: '0931000401', addedBy: 'self' });
  Object.assign(ids, { manager: manager._id, accountant: accountant._id, pharmacy: ph._id,
    warehouse: new mongoose.Types.ObjectId(), other: new mongoose.Types.ObjectId() });
  const pay = (over) => ({ pharmacyId: ph._id, warehouseId: ids.warehouse, amount: 0, currency: 'SYP', recordedBy: manager._id, ...over });
  await Payment.create([
    pay({ amount: 100000, amountSyp: 100000, method: 'cash', paidAt: new Date('2026-11-20T06:00:00Z'), paymentNumber: 1 }),
    pay({ amount: 50000, amountSyp: 50000, method: 'bank_transfer', paidAt: new Date('2026-11-20T05:00:00Z'), recordedBy: accountant._id, paymentNumber: 2 }),
    // Reversed later: still counts on its own day (the reversal takes it off).
    pay({ amount: 7000, amountSyp: 7000, method: 'cash', paidAt: new Date('2026-11-20T04:00:00Z'), status: 'reversed', paymentNumber: 3 }),
    // The reversal, dated today: a minus today.
    pay({ amount: 7000, amountSyp: 7000, method: 'cash', paidAt: new Date('2026-11-20T04:30:00Z'), kind: 'reversal', paymentNumber: 4 }),
    // 23:30 Damascus the day before (20:30 UTC on the 19th): yesterday.
    pay({ amount: 999, amountSyp: 999, method: 'cash', paidAt: new Date('2026-11-19T20:30:00Z'), paymentNumber: 5 }),
    // 00:30 Damascus on the 20th (21:30 UTC on the 19th): today.
    pay({ amount: 1000, amountSyp: 1000, method: 'cash', paidAt: new Date('2026-11-19T21:30:00Z'), paymentNumber: 6 }),
    // Another warehouse: never shown.
    pay({ warehouseId: ids.other, amount: 5, amountSyp: 5, method: 'cash', paidAt: new Date('2026-11-20T06:00:00Z'), paymentNumber: 7 }),
  ]);
});
test.after(stopMemoryMongo);

test("today's receipts follow the ledger: received minus reversed that day, by method and by who", async () => {
  const r = await dailyReceipts(ids.warehouse, {}, NOW);
  assert.equal(r.date, '2026-11-20');
  // Received that day: 100,000 + 50,000 + 7,000 (reversed later, still dated
  // today) + 1,000 (00:30 Damascus). The reversal dated today takes 7,000 off.
  assert.equal(r.receivedSyp, 158000);
  assert.equal(r.receivedCount, 4);
  assert.equal(r.reversedSyp, 7000);
  assert.equal(r.netSyp, 151000);
  assert.deepEqual(r.byMethod, { cash: 108000, bank_transfer: 50000 });
  assert.deepEqual(r.byRecorder.map((x) => [x.name, x.role, x.amountSyp, x.count]),
    [['Manager', 'owner', 108000, 3], ['Accountant', 'accountant', 50000, 1]]);
  assert.deepEqual(r.payments.map((p) => p.paymentNumber), [1, 2, 4, 3, 6]);
  assert.equal(r.payments[0].pharmacy.nameAr, 'صيدلية النور');
});

test('another day can be asked for, and a bad date is refused', async () => {
  const r = await dailyReceipts(ids.warehouse, { date: '2026-11-19' }, NOW);
  assert.equal(r.netSyp, 999);
  await assert.rejects(dailyReceipts(ids.warehouse, { date: '2026-02-30' }, NOW), { code: 'INVALID_DATE' });
});

test('a closed day keeps its figure when a payment is reversed on a later day', async () => {
  const wid = new mongoose.Types.ObjectId();
  const base = { pharmacyId: ids.pharmacy, warehouseId: wid, currency: 'SYP', recordedBy: ids.manager };
  await Payment.create([
    { ...base, amount: 50000, amountSyp: 50000, paidAt: new Date('2026-11-21T07:00:00Z'), status: 'reversed' },
    { ...base, amount: 50000, amountSyp: 50000, paidAt: new Date('2026-11-22T07:00:00Z'), kind: 'reversal', recordedBy: ids.accountant },
  ]);
  assert.equal((await dailyReceipts(wid, { date: '2026-11-21' }, NOW)).netSyp, 50000);
  assert.equal((await dailyReceipts(wid, { date: '2026-11-22' }, NOW)).netSyp, -50000);
});

test('totals cover every payment of the day, not just the listed ones', async () => {
  const wid = new mongoose.Types.ObjectId();
  const base = { pharmacyId: ids.pharmacy, warehouseId: wid, currency: 'SYP', recordedBy: ids.manager,
    amount: 1000, amountSyp: 1000, paidAt: new Date('2026-11-20T06:00:00Z') };
  await Payment.insertMany(Array.from({ length: 501 }, () => ({ ...base })));
  const r = await dailyReceipts(wid, {}, NOW);
  assert.equal(r.receivedSyp, 501000);
  assert.equal(r.receivedCount, 501);
  assert.equal(r.payments.length, 500);
  assert.equal(r.truncated, true);
});

test('a payment entered today but dated earlier is listed, not totalled; a missing amount is flagged', async () => {
  const wid = new mongoose.Types.ObjectId();
  const base = { pharmacyId: ids.pharmacy, warehouseId: wid, currency: 'SYP', recordedBy: ids.manager };
  const [late] = await Payment.create([{ ...base, amount: 3000, amountSyp: 3000, paidAt: new Date('2026-11-15T07:00:00Z'), paymentNumber: 9 }]);
  await Payment.collection.updateOne({ _id: late._id }, { $set: { createdAt: new Date('2026-11-20T06:30:00Z') } });
  await Payment.create([{ ...base, amount: 10, paidAt: new Date('2026-11-20T06:00:00Z') }]); // no amountSyp
  const r = await dailyReceipts(wid, {}, NOW);
  assert.equal(r.receivedSyp, 0);
  assert.equal(r.unknownAmountCount, 1);
  assert.deepEqual(r.enteredTodayDatedEarlier.map((p) => p.paymentNumber), [9]);
});
