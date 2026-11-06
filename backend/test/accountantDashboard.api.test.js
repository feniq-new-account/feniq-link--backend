process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'accountant-dashboard-isolated-test-secret';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const ledger = require('../src/services/ledger.service');
const { runInTransaction } = require('../src/utils/transaction');
const { financialReadSnapshot } = require('../src/utils/financialReadSnapshot');
const { dashboard } = require('../src/services/accountantDashboard.service');
const oid = () => new mongoose.Types.ObjectId();
let owner, accountant, foreign, wh, other, pharmacy, account, server, base;
let suffix = 0;
const at = new Date('2026-10-29T12:00:00Z');
async function user(role, warehouseRole = null, status = 'active') {
  return User.create({ name: role, phone: `+963944${String(++suffix).padStart(6, '0')}`, role, warehouseRole, status });
}
async function post(kind, amountSyp, extra = {}) {
  return (await runInTransaction((session) => ledger.postEntry({ account, kind, amountSyp, amountUsd: amountSyp / 100,
    fx: { rate: 100, source: 'manual' }, effectiveAt: at, createdBy: owner._id, ...extra }, session))).entry;
}
async function request(person, query = '') {
  const token = person ? jwt.sign({ sub: person.id, role: person.role, tokenVersion: 0 }, process.env.JWT_SECRET) : '';
  const response = await fetch(`${base}/api/warehouse/balances/dashboard${query}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'accountant-dashboard' });
  await Promise.all([LedgerEntry.init(), LedgerAccount.init()]);
  owner = await user('warehouse', 'owner'); accountant = await user('warehouse', 'accountant'); foreign = await user('warehouse', 'owner');
  wh = await Warehouse.create({ userId: owner.id, memberUserIds: [accountant.id], nameAr: 'A', nameEn: 'A', city: 'Latakia', address: 'a', phone: owner.phone });
  other = await Warehouse.create({ userId: foreign.id, nameAr: 'B', nameEn: 'B', city: 'Latakia', address: 'a', phone: foreign.phone });
  const phUser = await user('pharmacy');
  pharmacy = await Pharmacy.create({ userId: phUser.id, nameAr: 'Pharmacy A', nameEn: 'A', ownerName: 'Owner', city: 'Latakia',
    address: 'a', areaType: 'city', phone: phUser.phone, addedBy: 'self' });
  account = await ledger.resolveAccount(pharmacy.id, wh.id);
  await post('charge', 10000, { source: { orderId: oid() }, metadata: { invoiceNumber: 20, orderNumber: 30, secretUnrelatedField: 'must not leak' } });
  const payment = await post('payment', 2000, { source: { paymentId: oid() }, metadata: { paymentNumber: 40 } });
  await post('payment_reversal', 2000, { reversalOf: payment._id, reason: 'Mistaken payment' });
  await post('return_credit', 1000, { source: { returnId: oid() }, metadata: { invoiceNumber: 20 } });
  const otherAccount = await ledger.resolveAccount(pharmacy.id, other.id);
  await runInTransaction((session) => ledger.postEntry({ account: otherAccount, kind: 'charge', amountSyp: 999999, source: { orderId: oid() }, effectiveAt: at }, session));
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); });
const range = '?period=custom&from=2026-10-29&to=2026-10-29';
test('accountant and owner share frozen figures, corrections and references without writes', async () => {
  const before = JSON.stringify(await LedgerEntry.find().sort({ _id: 1 }).lean());
  const beforeAccounts = JSON.stringify(await LedgerAccount.find().sort({ _id: 1 }).lean());
  for (const person of [owner, accountant]) {
    const result = await request(person, range);
    assert.equal(result.status, 200); assert.equal(result.cache, 'no-store');
    assert.equal(result.body.summary.outstanding.totalDebtSyp, 9000);
    assert.equal(result.body.summary.current.collectionsSyp, 0);
    assert.equal(result.body.summary.current.returnsSyp, 1000);
    assert.equal(result.body.summary.current.salesSyp, 10000);
    assert.equal(result.body.activity.length, 4);
    assert.equal(result.body.activity.find((e) => e.kind === 'charge').reference.invoiceNumber, 20);
    assert.ok(result.body.asOf); assert.equal(result.body.timezone, 'Asia/Damascus');
    assert.ok(!JSON.stringify(result.body).includes('secretUnrelatedField'));
  }
  assert.equal(JSON.stringify(await LedgerEntry.find().sort({ _id: 1 }).lean()), before);
  assert.equal(JSON.stringify(await LedgerAccount.find().sort({ _id: 1 }).lean()), beforeAccounts);
});
test('tenant comes only from membership; activity filters cannot expand it', async () => {
  const result = await request(foreign, range);
  assert.equal(result.body.summary.outstanding.totalDebtSyp, 999999);
  assert.equal(result.body.activity.length, 1);
  const own = await request(accountant, `${range}&kind=payment&pharmacyId=${pharmacy.id}`);
  assert.equal(own.body.activity.length, 1); assert.equal(own.body.summary.current.collectionsSyp, 0);
  assert.equal((await request(owner, `${range}&warehouseId=${other.id}`)).status, 400);
});
test('rejects unauthenticated, other roles and inactive memberships; keeps legacy warehouse access', async () => {
  assert.equal((await request(null)).status, 401);
  for (const role of ['admin', 'pharmacy', 'rep', 'driver']) assert.equal((await request(await user(role))).status, 403);
  for (const status of ['pending', 'blocked', 'deleted']) assert.notEqual((await request(await user('warehouse', 'accountant', status))).status, 200);
  const legacy = await user('warehouse');
  await Warehouse.updateOne({ _id: wh.id }, { $addToSet: { memberUserIds: legacy._id } });
  assert.equal((await request(legacy)).status, 200);
});
test('empty ranges are honest; malformed periods and structured filters are rejected', async () => {
  const result = await request(accountant, '?period=custom&from=2010-01-01&to=2010-01-02');
  assert.equal(result.body.summary.current.collectionsSyp, 0); assert.deepEqual(result.body.activity, []);
  assert.equal(result.body.summary.outstanding.totalDebtSyp, 9000);
  for (const query of ['?period=bad', '?period=custom&from=2026-11-01&to=2026-10-01', '?kind=unknown', '?pharmacyId=bad', '?kind[$ne]=payment']) {
    assert.equal((await request(accountant, query)).status, 400);
  }
});
test('snapshot does not mix cached balances with a concurrent ledger commit', async () => {
  await financialReadSnapshot(async (session) => {
    const first = await LedgerAccount.findById(account._id).session(session).lean();
    await post('payment', 17, { source: { paymentId: oid() } });
    const second = await LedgerAccount.findById(account._id).session(session).lean();
    const rows = await LedgerEntry.find({ accountId: account._id }).session(session).lean();
    assert.equal(second.balanceCache.syp, first.balanceCache.syp);
    assert.equal(rows.reduce((sum, row) => sum + (row.direction === 'debit' ? row.amountSyp : -row.amountSyp), 0), first.balanceCache.syp);
  });
  assert.equal((await dashboard(wh._id, {}, at)).summary.outstanding.totalDebtSyp, 8983);
});
