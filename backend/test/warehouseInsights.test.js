process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'warehouse-insights-test-secret-at-least-32-characters';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const { runInTransaction } = require('../src/utils/transaction');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Order = require('../src/models/order.model');
const Assignment = require('../src/models/repAssignment.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const ledger = require('../src/services/ledger.service');
const insights = require('../src/services/warehouseInsights.service');
const billing = require('../src/services/warehouseSubscription.service');
let owner, accountant, otherOwner, wh, other, a, b, c, stranger, server, base;
const now = new Date('2026-10-29T12:00:00Z');
const oid = () => new mongoose.Types.ObjectId();
async function user(name, role, suffix, warehouseRole) {
  return User.create({ name, phone: `+9639440000${suffix}`, role, status: 'active', warehouseRole });
}
async function pharmacy(name, suffix) {
  const person = await user(name, 'pharmacy', suffix);
  return Pharmacy.create({ userId: person.id, nameAr: name, nameEn: name, ownerName: 'Owner', address: 'Street',
    city: 'Latakia', areaType: 'rural', phone: person.phone, addedBy: 'self' });
}
async function post(ph, warehouse, kind, amountSyp, at, source = {}, metadata = null) {
  const account = await ledger.resolveAccount(ph._id, warehouse._id);
  return runInTransaction((session) => ledger.postEntry({ account, kind, amountSyp,
    effectiveAt: new Date(at), source, metadata, createdBy: owner._id }, session));
}
async function request(person, path, method = 'GET', body) {
  const token = jwt.sign({ sub: person.id, role: person.role, tokenVersion: 0 }, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/warehouse/insights${path}`, { method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
const originalMongooseNow = mongoose.now;
test.before(async () => {
  mongoose.now = () => new Date('2026-10-29T03:00:00Z');
  await startMemoryMongo({ dbName: 'warehouse-insights' });
  await Promise.all([LedgerEntry.init(), LedgerAccount.init()]);
  owner = await user('Owner', 'warehouse', '01', 'owner');
  accountant = await user('Accountant', 'warehouse', '02', 'accountant');
  otherOwner = await user('Other owner', 'warehouse', '03', 'owner');
  wh = await Warehouse.create({ userId: owner.id, memberUserIds: [accountant.id], nameAr: 'Warehouse A', nameEn: 'A',
    city: 'Latakia', address: 'Street', phone: owner.phone });
  other = await Warehouse.create({ userId: otherOwner.id, nameAr: 'Warehouse B', nameEn: 'B', city: 'Jableh', address: 'Street', phone: otherOwner.phone });
  a = await pharmacy('Pharmacy A', '11'); b = await pharmacy('Pharmacy B', '12'); c = await pharmacy('Pharmacy C', '13'); stranger = await pharmacy('Stranger', '14');
  const first = await Order.create({ orderNumber: 981001, pharmacyId: a.id, warehouseId: wh.id,
    status: 'delivered', totalPrice: 10000, discountAmount: 0, commissionAmount: 0, finalPrice: 10000, createdAt: new Date('2026-10-01') });
  await post(a, wh, 'charge', 10000, '2026-10-01', { orderId: first._id });
  await post(a, wh, 'payment', 1000, '2026-10-28', { paymentId: oid() });
  const newer = oid();
  await post(a, wh, 'charge', 5000, '2026-10-28', { orderId: newer });
  await post(a, wh, 'return_credit', 5000, '2026-10-29T01:00:00Z', { returnId: oid() }, { orderId: newer });
  await post(b, wh, 'payment', 3000, '2026-10-28', { paymentId: oid() });
  await post(a, other, 'charge', 999999, '2026-10-01', { orderId: oid() });
  await Assignment.create({ warehouseId: wh.id, pharmacyId: c.id, repId: oid(), assignedBy: owner.id,
    active: true, createdAt: new Date('2026-10-09') });
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); mongoose.now = originalMongooseNow; });

test('daily charts and KPIs use the same snapshot, net delivered sales and source-isolated debts', async () => {
  const result = await insights.report(wh.id, { period: 'month', force: '1' }, now);
  assert.equal(result.settings.overdueDays, 15); assert.equal(result.settings.inactiveDays, 15);
  assert.deepEqual(result.totals, { salesSyp: 15000, returnsSyp: 5000, collectionsSyp: 4000, netSalesSyp: 10000 });
  assert.equal(result.daily.reduce((sum, row) => sum + row.netSalesSyp, 0), result.totals.netSalesSyp);
  assert.equal(result.aging.totalDebtSyp, 9000); assert.equal(result.aging.totalCreditSyp, 3000);
  assert.equal(result.aging.buckets.reduce((sum, value) => sum + value, 0), result.aging.totalDebtSyp);
});
test('follow-up lists include this warehouse customers/assignments only and page without duplicates', async () => {
  const snapshot = await insights.snapshotFor(wh.id, { force: true, now });
  const overdue = insights.followUpPage(snapshot, 'overdue');
  assert.equal(overdue.rows.length, 1); assert.equal(overdue.rows[0].pharmacy.id, a.id);
  assert.equal(overdue.rows[0].overdueSyp, 9000);
  const first = insights.followUpPage(snapshot, 'inactive', { limit: 1 });
  const second = insights.followUpPage(snapshot, 'inactive', { limit: 1, after: first.pagination.nextCursor });
  assert.equal(first.total, 2);
  assert.deepEqual(new Set([...first.rows, ...second.rows].map((row) => row.pharmacy.id)), new Set([a.id, c.id]));
  assert.ok(!JSON.stringify(snapshot.inactive).includes(stranger.id));
});
test('pagination keeps its original snapshot even when another operator refreshes the report', async () => {
  const first = await request(owner, '/follow-up?kind=inactive&limit=1&force=1');
  assert.equal(first.status, 200); assert.equal(first.body.pagination.hasMore, true);
  const cursor = encodeURIComponent(first.body.pagination.nextCursor);
  await request(owner, '/report?period=month&force=1');
  const second = await request(accountant, `/follow-up?kind=inactive&limit=1&after=${cursor}`);
  assert.equal(second.status, 200); assert.equal(second.body.asOf, first.body.asOf);
  assert.notEqual(second.body.rows[0].pharmacy.id, first.body.rows[0].pharmacy.id);
  assert.equal((await request(otherOwner, `/follow-up?kind=inactive&limit=1&after=${cursor}`)).status, 400);
  assert.equal((await request(owner, `/follow-up?kind=overdue&limit=1&after=${cursor}`)).status, 400);
});
test('unknown historical debt reconciles with total debt without inventing overdue invoices', async () => {
  const historical = await pharmacy('Unaged opening account', '15');
  const account = await ledger.resolveAccount(historical._id, wh._id);
  await runInTransaction((session) => ledger.postEntry({ account, kind: 'manual_debit', amountSyp: 2500,
    effectiveAt: new Date('2020-01-01'), reason: 'Historical amount without original invoice date', createdBy: owner._id }, session));
  const result = await insights.report(wh.id, { period: 'month', force: '1' }, now);
  assert.equal(result.aging.unknownAgeSyp, 2500); assert.equal(result.aging.totalDebtSyp, 11500);
  assert.equal(result.aging.buckets.reduce((sum, n) => sum + n, 0) + result.aging.unknownAgeSyp, result.aging.totalDebtSyp);
  assert.equal(result.aging.overdueSyp, 9000); assert.equal(result.aging.overduePharmacies, 1);
});
test('owner and accountant can open their reports; foreign warehouse data is absent', async () => {
  insights.invalidate(wh.id); insights.invalidate(other.id);
  const own = await request(owner, '/report?period=custom&from=2026-10-01&to=2026-10-29');
  const account = await request(accountant, '/report?period=custom&from=2026-10-01&to=2026-10-29');
  const foreign = await request(otherOwner, '/report?period=custom&from=2026-10-01&to=2026-10-29');
  assert.equal(own.status, 200); assert.equal(account.status, 200); assert.equal(foreign.status, 200);
  assert.equal(own.body.totals.salesSyp, account.body.totals.salesSyp);
  assert.equal(foreign.body.totals.salesSyp, 999999);
  assert.equal(own.body.timezone, 'Asia/Damascus');
  assert.match(own.body.asOfBusiness, /^[0-9-]+ [0-9:]+$/);
});
test('alerts include only the warehouse stale operational queues and exports preserve the snapshot', async () => {
  const stale = await Order.create({ orderNumber: 981002, pharmacyId: a.id, warehouseId: wh.id,
    status: 'pending', totalPrice: 100, discountAmount: 0, commissionAmount: 0, finalPrice: 100,
    createdAt: new Date('2026-10-20') });
  const pendingReturn = await require('../src/models/return.model').create({ orderId: stale.id,
    pharmacyId: a.id, warehouseId: wh.id, items: [], createdAt: new Date('2026-10-20') });
  insights.invalidate(wh.id);
  const response = await request(owner, '/alerts?force=1');
  assert.equal(response.status, 200);
  assert.equal(response.body.alerts.find((row) => row.code === 'orders_pending').count, 1);
  assert.equal(response.body.alerts.find((row) => row.code === 'returns_pending').count, 1);
  const exported = await request(owner, '/export?kind=overdue');
  assert.equal(exported.status, 200); assert.equal(exported.body.asOf, response.body.asOf);
  assert.equal(exported.body.rows.length, 1); assert.equal(exported.body.rows[0].pharmacy.id, a.id);
  await Order.deleteOne({ _id: stale.id }); await pendingReturn.deleteOne(); insights.invalidate(wh.id);
});
test('feature switches are enforced by the server for each report and follow-up tool', async () => {
  await billing.configureSubscription(wh.id, owner.id, { features: { ownerInsights: false, overdueReceivables: false, ownerAlerts: false } });
  assert.equal((await request(owner, '/report')).status, 403);
  assert.equal((await request(accountant, '/report')).status, 200, 'accountant has its separate salesReports entitlement');
  assert.equal((await request(owner, '/follow-up?kind=overdue')).status, 403);
  assert.equal((await request(owner, '/export?kind=overdue')).status, 403);
  assert.equal((await request(owner, '/follow-up?kind=inactive')).status, 200);
  assert.equal((await request(owner, '/alerts')).status, 403);
});
test('15-day defaults are configurable and stale settings cannot overwrite a newer choice', async () => {
  const changed = await request(owner, '/settings', 'PUT', { overdueDays: 30, inactiveDays: 35, revision: 0 });
  assert.equal(changed.status, 200); assert.equal(changed.body.settings.revision, 1);
  const stale = await request(owner, '/settings', 'PUT', { overdueDays: 2, inactiveDays: 2, revision: 0 });
  assert.equal(stale.status, 409);
  const snapshot = await insights.snapshotFor(wh.id, { now, force: true });
  assert.equal(snapshot.inactive.length, 0); assert.equal(snapshot.overdue.length, 0);
});
test('timestamps, malformed cursors and unbounded reporting windows are refused', async () => {
  await assert.rejects(insights.report(wh.id, { period: 'custom', from: '2026-10-01T12:00:00Z', to: '2026-10-29' }, now), { code: 'INVALID_PERIOD' });
  await assert.rejects(insights.report(wh.id, { period: 'custom', from: '2020-01-01', to: '2026-10-29' }, now), { code: 'INVALID_PERIOD' });
  const snapshot = await insights.snapshotFor(wh.id, { now });
  assert.throws(() => insights.followUpPage(snapshot, 'inactive', { after: '{bad' }), { code: 'INVALID_CURSOR' });
});
