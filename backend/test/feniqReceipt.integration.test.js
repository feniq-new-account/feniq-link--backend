process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'synthetic-feniq-receipt-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Product = require('../src/models/product.model');
const Rep = require('../src/models/rep.model');
const Assignment = require('../src/models/repAssignment.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const Account = require('../src/models/ledgerAccount.model');
const Entry = require('../src/models/ledgerEntry.model');
const Payment = require('../src/models/payment.model');
const FeniqReceipt = require('../src/models/feniqCollectionReceipt.model');
const Custody = require('../src/models/feniqCashCustody.model');
const Audit = require('../src/models/financialAuditLog.model');
const { Recognition, Event } = require('../src/models/collectionAccounting.model');
const contracts = require('../src/services/collectionContract.service');
const grants = require('../src/services/collectionGrant.service');
const orders = require('../src/services/order.service');
const warehouseOrders = require('../src/services/warehouseOrder.service');
const ledger = require('../src/services/ledger.service');
const { ACTIONS } = require('../src/utils/collectionActorPolicy');
let server, base, admin, collector, approver, owner, pharmacyUser, warehouse, pharmacy, product;
let serial = 0;
const key = () => 'feniq-cash-test-' + (++serial);
test.before(async () => {
  process.env.FENIQ_COLLECTION_RECEIPTS_ENABLED = 'true';
  await startMemoryMongo({ dbName: 'feniq-cash-receipts-isolated', orderingOpen: true });
  await ledger.ensureFinancialIndexes();
  await Payment.createIndexes();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
  delete process.env.FENIQ_COLLECTION_RECEIPTS_ENABLED;
});
async function call(actor, method, path, body) {
  const token = actor && jwt.sign({ sub: String(actor._id) }, env.jwtSecret, { expiresIn: '1h' });
  const response = await fetch(base + path, { method, headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, replay: response.headers.get('Idempotent-Replay'),
    body: await response.json() };
}
test.beforeEach(async () => {
  for (const collection of await mongoose.connection.db.collections()) await collection.deleteMany({});
  // Pilot ordering is enabled only inside this disposable MongoDB replica set.
  await mongoose.connection.collection('platformsettings').insertOne({ key: 'pharmacistLaunch',
    value: { mode: 'ordering_open', message: 'Synthetic accounting acceptance only', revision: 1 } });
  [admin, collector, approver, owner, pharmacyUser] = await User.create([
    { name: 'Synthetic admin', phone: '0988000001', role: 'admin', status: 'active' },
    { name: 'Synthetic Feniq collector', phone: '0988000002', role: 'admin', status: 'active' },
    { name: 'Synthetic Feniq approver', phone: '0988000003', role: 'admin', status: 'active' },
    { name: 'Synthetic warehouse owner', phone: '0988000004', role: 'warehouse', warehouseRole: 'owner', status: 'active' },
    { name: 'Synthetic pharmacy', phone: '0988000005', role: 'pharmacy', status: 'active' },
  ]);
  warehouse = await Warehouse.create({ userId: owner._id, nameAr: 'اختبار', nameEn: 'Synthetic',
    phone: '0988000004', address: 'Test', city: 'Latakia', deliveryType: 'self',
    requireDeliverySealPhoto: false, isActive: true, discountRate: 0, commissionRate: 0 });
  pharmacy = await Pharmacy.create({ userId: pharmacyUser._id, nameAr: 'اختبار', nameEn: 'Synthetic pharmacy',
    ownerName: 'Test', phone: '0988000005', city: 'Latakia', address: 'Test', areaType: 'city', addedBy: 'self' });
  product = await Product.create({ warehouseId: warehouse._id, nameAr: 'اختبار', nameEn: 'Synthetic medicine',
    manufacturerAr: 'Test', price: 10, unitAr: 'علبة', unitEn: 'box', isActive: true, isAvailable: true });
  const repUser = await User.create({ name: 'Synthetic warehouse rep', phone: '0988000006',
    role: 'rep', status: 'active' });
  const rep = await Rep.create({ warehouseId: warehouse._id, userId: repUser._id,
    name: 'Synthetic rep', phone: '0988000006', commissionRate: 2 });
  await Assignment.create({ warehouseId: warehouse._id, pharmacyId: pharmacy._id,
    repId: rep._id, assignedBy: owner._id, active: true });
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });
  await contracts.createAndActivate(admin._id, warehouse._id, {
    agreementReference: 'synthetic-feniq-agreement', basis: 'net_pharmacy_invoice',
    deliveryFeeSyp: null, expectedRevision: 0, idempotencyKey: key(),
  });
  await grants.issue(admin._id, String(warehouse._id), {
    actorId: String(collector._id), action: ACTIONS.RECORD_FENIQ,
    reason: 'Synthetic delegated recording', idempotencyKey: key(),
  });
  await grants.issue(admin._id, String(warehouse._id), {
    actorId: String(approver._id), action: ACTIONS.APPROVE_FENIQ,
    reason: 'Synthetic delegated approval', idempotencyKey: key(),
  });
  const created = await orders.createOrder({ userId: pharmacyUser._id, pharmacyId: pharmacy._id,
    warehouseId: warehouse._id, items: [{ productId: String(product._id), quantity: 1 }],
    idempotencyKey: key() });
  let current = created;
  for (let i = 0; i < 3; i++) current = await warehouseOrders.advanceOrderStatus(current._id, warehouse._id, owner._id);
});
const path = () => '/admin/collection-accounting/warehouses/' + warehouse._id + '/feniq-receipts';
const submission = () => ({ pharmacyId: String(pharmacy._id), amountSyp: 50000,
  actualReceivedAt: '2026-11-06T10:00:00Z', reference: 'Synthetic cash handover',
  idempotencyKey: key() });

test('pending evidence is idempotent; two-person approval posts one ledger payment and 24/48h custody', async () => {
  const body = submission();
  const initialPayments = await Payment.countDocuments();
  const initialLedgerPayments = await Entry.countDocuments({ kind: 'payment' });
  assert.equal((await call(null, 'POST', path(), body)).status, 401);
  assert.equal((await call(admin, 'POST', path(), body)).status, 403);
  const pending = await call(collector, 'POST', path(), body);
  assert.equal(pending.status, 201);
  assert.equal(pending.body.receipt.status, 'pending');
  assert.equal((await call(collector, 'POST', path(), body)).replay, 'true');
  assert.equal((await call(collector, 'POST', path(), { ...body, amountSyp: 60000 })).status, 409);
  assert.equal(await Payment.countDocuments(), initialPayments);
  assert.equal(await Entry.countDocuments({ kind: 'payment' }), initialLedgerPayments);
  assert.equal(await Recognition.countDocuments({ collector: 'feniq' }), 0);
  const url = path() + '/' + pending.body.receipt.id + '/review';
  const approval = { decision: 'approved', idempotencyKey: key() };
  assert.equal((await call(collector, 'POST', url, approval)).status, 403);
  assert.equal((await call(admin, 'POST', url, approval)).status, 403);
  const approved = await call(approver, 'POST', url, approval);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.receipt.status, 'approved');
  assert.ok(approved.body.receipt.paymentId);
  assert.equal(await Payment.countDocuments(), initialPayments + 1);
  const payment = await Payment.findById(approved.body.receipt.paymentId).lean();
  assert.equal(String(payment.recordedBy), String(collector._id));
  const postingEntry = await Entry.findById(payment.ledgerEntryId).lean();
  assert.equal(String(postingEntry.createdBy), String(approver._id));
  const postingAudit = await Audit.findOne({ action: 'payment.recorded' }).lean();
  assert.equal(String(postingAudit.actorId), String(approver._id));
  assert.equal(await Entry.countDocuments({ kind: 'payment' }), initialLedgerPayments + 1);
  assert.equal(await Recognition.countDocuments({ collector: 'feniq' }), 1);
  assert.equal((await call(approver, 'POST', url, approval)).replay, 'true');
  assert.equal((await call(approver, 'POST', url, { ...approval, idempotencyKey: key() })).status, 409);
  assert.equal(await Payment.countDocuments(), initialPayments + 1);

  const custody = await Custody.findOne({ receiptId: pending.body.receipt.id }).lean();
  assert.equal(custody.grossHeldSyp, 50000);
  assert.equal(custody.status, 'awaiting_reconciliation');
  assert.equal(custody.netWarehouseDueSyp, null);
  const custodyPage = await call(admin, 'GET',
    '/admin/collection-accounting/warehouses/' + warehouse._id + '/feniq-custody');
  assert.equal(custodyPage.status, 200);
  assert.equal(custodyPage.body.rows.length, 1);
  assert.equal(custodyPage.body.rows[0].grossHeldSyp, 50000);
  assert.equal(custodyPage.body.rows[0].netWarehouseDueSyp, null);
  assert.equal(custodyPage.body.grossMeansCollectedCashNotNetWarehouseDue, true);
  assert.equal(custody.targetRemittanceAt.getTime() - custody.actualReceivedAt.getTime(), 24 * 3600 * 1000);
  assert.equal(custody.deadlineAt.getTime() - custody.actualReceivedAt.getTime(), 48 * 3600 * 1000);
  assert.equal(await Audit.countDocuments({ action: 'collection.receipt_approved' }), 1);
  assert.equal(await Audit.countDocuments({ action: 'collection.custody_opened' }), 1);
  const balance = await Account.findOne({ warehouseId: warehouse._id, pharmacyId: pharmacy._id }).lean();
  assert.equal(balance.balanceCache.syp, 50000);
  const commissions = await Event.find({ warehouseId: warehouse._id }).lean();
  assert.equal(commissions.reduce((n, e) => n + e.feniqSyp, 0), 500);
  assert.equal(commissions.reduce((n, e) => n + e.repSyp, 0), 500);
});

test('rejecting an evidence report never moves money and survives retry', async () => {
  const b = submission();
  const pending = await call(collector, 'POST', path(), b);
  assert.equal(pending.status, 201);
  const u = path() + '/' + pending.body.receipt.id + '/review';
  const decision = { decision: 'rejected', reason: 'No verified handover', idempotencyKey: key() };
  assert.equal((await call(approver, 'POST', u, decision)).status, 200);
  assert.equal((await call(approver, 'POST', u, decision)).replay, 'true');
  assert.equal((await call(approver, 'POST', u, { decision: 'approved', idempotencyKey: key() })).status, 409);
  assert.equal(await FeniqReceipt.countDocuments({ status: 'rejected' }), 1);
  assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await Custody.countDocuments(), 0);
});
