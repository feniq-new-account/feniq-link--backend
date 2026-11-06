process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'accounting-reporting-isolated-test-secret';
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
const ExchangeRate = require('../src/models/exchangeRate.model');
const ledger = require('../src/services/ledger.service');
const statements = require('../src/services/accountStatement.service');
const payments = require('../src/services/payment.service');
const { runInTransaction } = require('../src/utils/transaction');
let person, wh, ph, account, server, base;
async function post(kind, amountSyp, effectiveAt) {
  return runInTransaction((session) => ledger.postEntry({ account, kind, amountSyp,
    effectiveAt: new Date(effectiveAt), source: kind === 'charge' ? { orderId: new mongoose.Types.ObjectId() } : {}, reason: 'Synthetic reporting fixture' }, session));
}
const args = () => ({ pharmacyId: ph.id, warehouseId: wh.id, from: '2026-10-20', to: '2026-10-20' });
test.before(async () => {
  await startMemoryMongo({ dbName: 'statement-reporting' });
  await Promise.all([LedgerEntry.init(), LedgerAccount.init()]);
  person = await User.create({ name: 'Accounting', phone: '+963944900001', role: 'warehouse', status: 'active', warehouseRole: 'accountant' });
  wh = await Warehouse.create({ userId: person.id, nameAr: 'مستودع', nameEn: 'Warehouse', city: 'Latakia', address: 'a', phone: person.phone });
  ph = await Pharmacy.create({ userId: new mongoose.Types.ObjectId(), nameAr: 'صيدلية', nameEn: 'Pharmacy', ownerName: 'Owner', city: 'Latakia',
    address: 'a', areaType: 'city', phone: '+963944900002', addedBy: 'self' });
  account = await ledger.resolveAccount(ph.id, wh.id);
  await post('charge', 1000, '2026-10-10T12:00:00Z');
  await post('manual_debit', 400, '2026-10-20T12:00:00Z');
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual', manualOverride: true, lastUpdated: new Date() });
  for (const [day, amount] of [['2026-10-10T13:00:00Z', 100], ['2026-10-20T13:00:00Z', 50]]) {
    await payments.createPayment(wh.id, person.id, { pharmacyId: ph.id, amount, currency: 'SYP', paidAt: day, idempotencyKey: `report-${day}` });
  }
  server = require('../src/app').listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); });
test('reconciles whole-day opening plus signed entries to closing without changing FX or cache', async () => {
  const result = await statements.getStatement(args());
  assert.equal(result.opening.syp, 900); assert.equal(result.closing.syp, 1250);
  assert.deepEqual(result.reconciliation, { netMovementSyp: 350, differenceSyp: 0, reconciled: true });
  assert.ok(result.asOf); assert.ok(result.rows.every((row) => row.postedAt));
  const signed = result.rows.reduce((sum, row) => sum + row.debitSyp - row.creditSyp, 0);
  assert.equal(result.opening.syp + signed, result.closing.syp);
  await assert.rejects(statements.getStatement({ ...args(), from: '2026-10-21' }), { code: 'INVALID_PERIOD' });
});
test('warehouse HTTP statement and payment list share a snapshot and explicit period scope', async () => {
  const token = jwt.sign({ sub: person.id, role: person.role }, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/warehouse/balances/${ph.id}?from=2026-10-20&to=2026-10-20`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(); assert.equal(result.paymentsScope, 'period');
  assert.equal(result.payments.length, 1); assert.equal(result.payments[0].amountSyp, 50);
  assert.equal(result.statement.closing.syp, 1250); assert.ok(result.statement.rows[0].postedAt);
});
test('backdated commit between opening and rows cannot tear a statement snapshot', async () => {
  const original = ledger.openingBalanceFor;
  let injected = false;
  ledger.openingBalanceFor = async (...params) => {
    const opening = await original(...params);
    if (!injected) { injected = true; await post('manual_debit', 99, '2026-10-10T11:00:00Z'); }
    return opening;
  };
  try { assert.equal((await statements.getStatement(args())).closing.syp, 1250); }
  finally { ledger.openingBalanceFor = original; }
  assert.equal((await statements.getStatement(args())).opening.syp, 999);
  assert.equal((await statements.getStatement(args())).closing.syp, 1349);
});
