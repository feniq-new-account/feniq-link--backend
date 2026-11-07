process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1/unused';
process.env.JWT_SECRET = 'isolated-feniq-remittance-test-secret';
process.env.FENIQ_COLLECTION_RECEIPTS_ENABLED = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { randomUUID: key } = require('node:crypto');
const { startMemoryMongo, stopMemoryMongo, clearCollections } = require('./helpers/mongo');
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
const Grant = require('../src/models/collectionActorGrant.model');
const Receipt = require('../src/models/feniqCollectionReceipt.model');
const Custody = require('../src/models/feniqCashCustody.model');
const Audit = require('../src/models/financialAuditLog.model');
const { Remittance, Reconciliation } = require('../src/models/feniqRemittance.model');
const { Invoice, ReturnCredit } = require('../src/models/collectionAccounting.model');
const { ACTIONS } = require('../src/utils/collectionActorPolicy');
const grants = require('../src/services/collectionGrant.service');
const receipts = require('../src/services/feniqReceipt.service');
const remittances = require('../src/services/feniqRemittance.service');
const orders = require('../src/services/order.service');
const warehouseOrders = require('../src/services/warehouseOrder.service');
const contracts = require('../src/services/collectionContract.service');
const ledger = require('../src/services/ledger.service');
let server, base, admin, collector, approver, treasurer, owner, accountant, pharmacyUser, warehouse, pharmacy, product, invoice;
async function call(user, method, path, body) {
  const token = user && jwt.sign({ sub: user.id, role: user.role, tokenVersion: 0 }, process.env.JWT_SECRET);
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, replay: response.headers.get('Idempotent-Replay'), body: await response.json() };
}
const path = () => '/admin/collection-accounting/warehouses/' + warehouse.id;
const evidence = amountSyp => ({ pharmacyId: pharmacy.id, amountSyp, actualReceivedAt: '2026-11-06T10:00:00Z', reference: 'Synthetic cash evidence', idempotencyKey: key() });
async function receive(amountSyp) {
  const row = await receipts.record(collector.id, warehouse.id, evidence(amountSyp));
  await receipts.review(approver.id, warehouse.id, String(row.receipt.id), { decision: 'approved', idempotencyKey: key() });
  return row;
}
async function delivered(quantity = 1) {
  let order = await orders.createOrder({ userId: pharmacyUser.id, pharmacyId: pharmacy.id, warehouseId: warehouse.id,
    items: [{ productId: product.id, quantity }], idempotencyKey: key() });
  for (let i = 0; i < 3; i++) order = await warehouseOrders.advanceOrderStatus(order._id, warehouse.id, owner.id);
  return order;
}
async function transfer() {
  const snapshot = await remittances.reconcile(treasurer.id, warehouse.id, { idempotencyKey: key() });
  const body = { reconciliationId: String(snapshot._id), amountSyp: snapshot.result.netWarehouseDueSyp,
    transferredAt: '2026-11-07T10:00:00Z', reference: 'Synthetic bank transfer', idempotencyKey: key() };
  const movement = await remittances.record(treasurer.id, warehouse.id, body);
  return { snapshot, movement, body };
}
async function decision(movement, decision = 'confirmed') {
  const body = { decision, reason: 'Synthetic independent bank evidence verification', idempotencyKey: key() };
  const result = await remittances.review(accountant.id, warehouse.id, String(movement._id), body);
  return { result, body };
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-remittance-isolated' });
  await ledger.ensureFinancialIndexes();
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await stopMemoryMongo(); });
test.beforeEach(async () => {
  await clearCollections(...Object.values(mongoose.models));
  // Explicit isolated sales fixture; no production config is read or changed.
  await require('../src/models/platformSetting.model').create({ key: 'pharmacistLaunch', value: { mode: 'ordering_open', revision: 1 } });
  [admin, collector, approver, treasurer, owner, accountant, pharmacyUser] = await User.create([
    ...['Grantor', 'Collector', 'Approver', 'Treasurer'].map((name, i) => ({ name, phone: '098810000' + i, role: 'admin', status: 'active' })),
    { name: 'Owner', phone: '0988100004', role: 'warehouse', warehouseRole: 'owner', status: 'active' },
    { name: 'Accountant', phone: '0988100005', role: 'warehouse', warehouseRole: 'accountant', status: 'active' },
    { name: 'Pharmacy', phone: '0988100006', role: 'pharmacy', status: 'active' },
  ]);
  warehouse = await Warehouse.create({ userId: owner.id, memberUserIds: [accountant.id], nameAr: 'اختبار', nameEn: 'Synthetic', phone: owner.phone,
    address: 'Test', city: 'Latakia', deliveryType: 'self', requireDeliverySealPhoto: false, isActive: true, commissionRate: 0 });
  pharmacy = await Pharmacy.create({ userId: pharmacyUser.id, nameAr: 'اختبار', nameEn: 'Synthetic', ownerName: 'Test', phone: pharmacyUser.phone,
    address: 'Test', city: 'Latakia', areaType: 'city', addedBy: 'self' });
  product = await Product.create({ warehouseId: warehouse.id, nameAr: 'اختبار', nameEn: 'Synthetic', manufacturerAr: 'Test',
    price: 10, unitAr: 'علبة', unitEn: 'box', isActive: true, isAvailable: true });
  const repUser = await User.create({ name: 'Rep', phone: '0988100007', role: 'rep', status: 'active' });
  const rep = await Rep.create({ warehouseId: warehouse.id, userId: repUser.id, name: 'Rep', phone: repUser.phone, commissionRate: 2 });
  await Assignment.create({ warehouseId: warehouse.id, pharmacyId: pharmacy.id, repId: rep.id, assignedBy: owner.id, active: true });
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });
  await contracts.createAndActivate(admin.id, warehouse.id, { agreementReference: 'Synthetic frozen terms', basis: 'net_pharmacy_invoice', deliveryFeeSyp: null, expectedRevision: 0, idempotencyKey: key() });
  for (const [actor, action] of [[collector, ACTIONS.RECORD_FENIQ], [approver, ACTIONS.APPROVE_FENIQ], [treasurer, ACTIONS.RECORD_REMITTANCE],
    [treasurer, ACTIONS.REVERSE_REMITTANCE], [accountant, ACTIONS.CONFIRM_REMITTANCE]]) {
    await grants.issue(admin.id, warehouse.id, { actorId: actor.id, action, reason: 'Synthetic authorization', idempotencyKey: key() });
  }
  invoice = await delivered();
});

test('partial receipts reconcile exact city shares; HTTP transfer/retry/independent confirmation never posts another pharmacy payment', async () => {
  await receive(25000); await receive(25000);
  const before = await Account.findOne().lean();
  const paymentCount = await Payment.countDocuments(), entryCount = await Entry.countDocuments();
  const { snapshot, movement, body } = await transfer();
  assert.equal(snapshot.result.grossCollectedSyp, 50000);
  assert.equal(snapshot.result.originalCommissionSyp, 1000);
  assert.equal(snapshot.result.feniqSyp, 500); assert.equal(snapshot.result.repSyp, 500);
  assert.equal(snapshot.result.netWarehouseDueSyp, 49000);
  assert.equal((await call(treasurer, 'POST', path() + '/remittances', body)).replay, 'true');
  assert.equal((await call(treasurer, 'POST', path() + '/remittances', { ...body, amountSyp: 48999 })).status, 409);
  assert.equal((await call(treasurer, 'POST', '/warehouse/collection-accounting/remittances/' + movement._id + '/review', { decision: 'confirmed', reason: 'self', idempotencyKey: key() })).status, 403);
  const approval = { decision: 'confirmed', reason: 'Synthetic independent confirmation', idempotencyKey: key() };
  const url = '/warehouse/collection-accounting/remittances/' + movement._id + '/review';
  assert.equal((await call(accountant, 'POST', url, approval)).status, 201);
  assert.equal((await call(accountant, 'POST', url, approval)).replay, 'true');
  assert.equal(await Remittance.countDocuments(), 1);
  const read = await remittances.read(owner.id, warehouse.id);
  assert.equal(read.summary.netWarehouseDueSyp, 0); assert.equal(read.summary.cashInCustodySyp, 1000);
  assert.equal(await Custody.countDocuments({ status: 'remitted' }), 2);
  assert.equal(await Payment.countDocuments(), paymentCount); assert.equal(await Entry.countDocuments(), entryCount);
  assert.equal((await Account.findById(before._id).lean()).balanceCache.syp, before.balanceCache.syp);
  assert.equal(await Audit.countDocuments({ action: 'collection.remittance_confirmed' }), 1);
  assert.ok(snapshot.result.accounts[0].rows[0].allocations[0].contractId);
});

test('multiple one-lira rounding boundaries sum to the engine target without a one-lira discrepancy', async () => {
  for (const amount of [25, 25, 25, 25]) await receive(amount);
  const result = (await remittances.read(admin.id, warehouse.id)).summary;
  assert.equal(result.grossCollectedSyp, 100); assert.equal(result.originalCommissionSyp, 2);
  assert.equal(result.feniqSyp, 1); assert.equal(result.repSyp, 1); assert.equal(result.netWarehouseDueSyp, 98);
  assert.equal(result.accounts[0].rows.reduce((n, r) => n + r.netWarehouseDueSyp, 0), 98);
});

test('rural and city_ring frozen contracts allocate 100 percent to Feniq; later geography does not rewrite city history', async () => {
  await Pharmacy.updateOne({ _id: pharmacy.id }, { $set: { areaType: 'rural' } });
  await delivered();
  await Pharmacy.updateOne({ _id: pharmacy.id }, { $set: { areaType: 'city_ring' } });
  await delivered();
  await receive(300000);
  const result = (await remittances.read(admin.id, warehouse.id)).summary;
  assert.equal(result.originalCommissionSyp, 6000); assert.equal(result.feniqSyp, 5000); assert.equal(result.repSyp, 1000);
  assert.equal(result.netWarehouseDueSyp, 294000);
});

test('confirmed remittance reversal requires independent evidence and changes custody only once', async () => {
  await receive(50000);
  const { movement } = await transfer(); await decision(movement);
  const count = await Entry.countDocuments();
  const body = { amountSyp: movement.amountSyp, transferredAt: '2026-11-07T10:30:00Z', reference: 'Synthetic returned bank transfer', reason: 'Wrong bank reference', idempotencyKey: key() };
  const reversal = await remittances.record(treasurer.id, warehouse.id, body, String(movement._id));
  assert.equal((await remittances.read(admin.id, warehouse.id)).summary.netWarehouseDueSyp, 0);
  const approved = await decision(reversal);
  assert.equal((await remittances.review(accountant.id, warehouse.id, String(reversal._id), approved.body)).replay, true);
  assert.equal((await remittances.read(admin.id, warehouse.id)).summary.netWarehouseDueSyp, 49000);
  assert.equal((await Remittance.findById(movement._id).lean()).status, 'reversed');
  assert.equal(await Entry.countDocuments(), count);
  assert.equal(await Audit.countDocuments({ action: 'collection.remittance_reversed' }), 1);
  await assert.rejects(remittances.record(treasurer.id, warehouse.id, { ...body, idempotencyKey: key() }, String(movement._id)), { code: 'INVALID_REMITTANCE_REVERSAL' });
});

test('FIFO and returns before and after transfer create new immutable calculations and carry corrections forward', async () => {
  const firstInvoice = invoice;
  invoice = await delivered(2);
  await receive(150000); // oldest invoice 100000, then 50000 of the second.
  const initial = await remittances.read(admin.id, warehouse.id);
  assert.equal(initial.summary.accounts[0].rows[0].allocations[0].amountSyp, 100000);
  const item = await require('../src/models/orderItem.model').findOne({ orderId: invoice._id });
  const { returnRequest } = await require('../src/services/return.service').createReturn({ pharmacyId: pharmacy.id, orderId: String(invoice._id),
    items: [{ orderItemId: item.id, quantity: 1, reasonType: 'damaged' }], notes: 'Synthetic return', images: [] });
  await require('../src/services/warehouseReturn.service').approveReturn(returnRequest._id, warehouse.id, owner.id);
  assert.equal(await ReturnCredit.countDocuments(), 1);
  const { snapshot, movement } = await transfer();
  assert.equal(snapshot.result.originalCommissionSyp, 2500); assert.equal(snapshot.result.netWarehouseDueSyp, 147500);
  await decision(movement);
  const frozen = await Reconciliation.findById(snapshot._id).lean();
  const firstItem = await require('../src/models/orderItem.model').findOne({ orderId: firstInvoice._id });
  const secondReturn = await require('../src/services/return.service').createReturn({ pharmacyId: pharmacy.id, orderId: String(firstInvoice._id),
    items: [{ orderItemId: firstItem.id, quantity: 1, reasonType: 'damaged' }], notes: 'Synthetic second return', images: [] });
  await require('../src/services/warehouseReturn.service').approveReturn(secondReturn.returnRequest._id, warehouse.id, owner.id);
  const current = await remittances.read(admin.id, warehouse.id);
  assert.equal(current.summary.originalCommissionSyp, 500); assert.equal(current.summary.netWarehouseDueSyp, 2000);
  assert.deepEqual(await Reconciliation.findById(snapshot._id).lean(), frozen);
  assert.equal((await Remittance.findById(movement._id).lean()).amountSyp, 147500);
});

test('changed sources invalidate pending evidence; rejection releases reservation without affecting pharmacy debt', async () => {
  await receive(25000);
  const { movement } = await transfer();
  await receive(25000);
  await assert.rejects(decision(movement), { code: 'CUSTODY_RECONCILIATION_CHANGED' });
  assert.equal((await Remittance.findById(movement._id).lean()).status, 'pending');
  await decision(movement, 'rejected');
  assert.equal((await remittances.read(admin.id, warehouse.id)).summary.netWarehouseDueSyp, 49000);
  await transfer();
});

test('concurrent different transfer requests cannot reserve the same cash twice; identical requests replay', async () => {
  await receive(50000);
  const snapshot = await remittances.reconcile(treasurer.id, warehouse.id, { idempotencyKey: key() });
  const body = { reconciliationId: String(snapshot._id), amountSyp: 49000, transferredAt: '2026-11-07T10:00:00Z', reference: 'Synthetic', idempotencyKey: key() };
  const results = await Promise.all([remittances.record(treasurer.id, warehouse.id, body), remittances.record(treasurer.id, warehouse.id, body)]);
  assert.equal(results.filter(r => r.replay).length, 1); assert.equal(await Remittance.countDocuments(), 1);
  await assert.rejects(remittances.record(treasurer.id, warehouse.id, { ...body, idempotencyKey: key() }), { code: 'REMITTANCE_PENDING' });
});

test('unapplied cash blocks net approval with an audited reason', async () => {
  await receive(100001);
  const blocked = await remittances.reconcile(treasurer.id, warehouse.id, { idempotencyKey: key() });
  assert.equal(blocked.result.netWarehouseDueSyp, null);
  assert.equal(blocked.result.blockers[0].code, 'CUSTODY_UNALLOCATED_CASH');
  assert.equal((await Custody.findOne().lean()).netWarehouseDueSyp, null);
  assert.ok(await Audit.exists({ entityId: blocked._id, action: 'collection.custody_reconciled' }));
  assert.equal((await call(collector, 'POST', path() + '/cash-reconciliation', { idempotencyKey: key() })).status, 403);
});

test('read-only permissions do not mutate grants; tenant and role isolation also protect transfer approval', async () => {
  await receive(50000);
  const before = await Grant.find().sort({ _id: 1 }).lean();
  const read = await call(accountant, 'GET', '/warehouse/collection-accounting/cash-reconciliation');
  assert.equal(read.status, 200); assert.equal(read.body.summary.netWarehouseDueSyp, 49000);
  assert.deepEqual(await Grant.find().sort({ _id: 1 }).lean(), before);
  const other = await User.create({ name: 'Other accountant', role: 'warehouse', warehouseRole: 'accountant', status: 'active', phone: '0988100099' });
  await Warehouse.create({ userId: other.id, nameAr: 'آخر', nameEn: 'Other', address: 'Other', city: 'Latakia', phone: other.phone });
  const { movement } = await transfer();
  const denied = await call(other, 'POST', '/warehouse/collection-accounting/remittances/' + movement._id + '/review', { decision: 'confirmed', reason: 'Not own warehouse', idempotencyKey: key() });
  assert.equal(denied.status, 404);
  assert.equal((await call(pharmacyUser, 'GET', path() + '/cash-reconciliation')).status, 403);
  assert.equal((await call(null, 'GET', path() + '/cash-reconciliation')).status, 401);
});

test('collector revocation during recording and approval aborts the whole posting transaction', async () => {
  const grant = await Grant.findOne({ actorId: collector.id, action: ACTIONS.RECORD_FENIQ }).lean();
  const pending = await receipts.record(collector.id, warehouse.id, evidence(50000));
  const before = await Account.findOne().lean();
  // Pause exactly before the financial authorization write, after the stale
  // snapshot read. A separate real transaction revokes that same grant.
  const originalUpdate = Grant.updateOne;
  let revoked = false;
  Grant.updateOne = function(filter, update, options) {
    if (!revoked && String(filter._id) === String(grant._id) && update.$inc?.authorizationRevision) {
      revoked = true;
      return (async () => {
        await grants.revoke(admin.id, warehouse.id, String(grant._id), { reason: 'Synthetic racing revocation', idempotencyKey: key() });
        return originalUpdate.call(Grant, filter, update, options);
      })();
    }
    return originalUpdate.call(Grant, filter, update, options);
  };
  try {
    await assert.rejects(receipts.review(approver.id, warehouse.id, String(pending.receipt.id), { decision: 'approved', idempotencyKey: key() }), { code: 'FENIQ_COLLECTION_GRANT_REQUIRED' });
  } finally { Grant.updateOne = originalUpdate; }
  assert.equal(revoked, true); assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await Entry.countDocuments({ kind: 'payment' }), 0); assert.equal(await Custody.countDocuments(), 0);
  assert.equal((await Receipt.findById(pending.receipt.id).lean()).status, 'pending');
  assert.equal((await Account.findById(before._id).lean()).balanceCache.syp, before.balanceCache.syp);
  assert.equal(await Audit.countDocuments({ action: 'collection.receipt_approved' }), 0);
  await assert.rejects(receipts.record(collector.id, warehouse.id, evidence(1)), { code: 'FENIQ_COLLECTION_GRANT_REQUIRED' });
});

test('Feniq-held commission is journaled as retained, not demanded from the warehouse a second time', async () => {
  await receive(50000);
  const cash = require('../src/services/commissionCollection.service');
  const period = { from: new Date('2026-01-01'), to: new Date('2027-12-31') };
  const { summary } = await cash.getWarehouseCommissionDetail(warehouse.id, period);
  assert.equal(summary.commissionOwedSyp, 500);
  assert.equal(summary.heldByFeniqSyp, 500); assert.equal(summary.outstandingSyp, 0);
  assert.equal(summary.cashCustody.netWarehouseDueSyp, 49000);
  assert.equal(summary.cashCustody.cashInCustodySyp, 50000);
  assert.equal(summary.cashCustody.scope, 'latest_audited_reconciliation');
  const overview = await call(admin, 'GET', '/admin/commission/overview?from=2026-01-01&to=2027-12-31');
  assert.equal(overview.status, 200);
  const overviewRow = overview.body.overview.warehouses.find(row => row.warehouseId === warehouse.id);
  assert.equal(overviewRow.cashCustody.netWarehouseDueSyp, 49000);
  assert.equal(overviewRow.heldByFeniqSyp, 500);
  assert.equal(overviewRow.currentCashOutstandingSyp, 0);
  await assert.rejects(cash.recordCollection({ warehouseId: warehouse.id, actorId: admin.id,
    periodFrom: period.from, periodTo: period.to, amountSyp: 500, method: 'cash', idempotencyKey: key() }),
  { code: 'FENIQ_COMMISSION_ALREADY_HELD' });
  assert.equal(await Payment.countDocuments(), 1);
  const held = await require('../src/models/feniqRemittance.model').Withholding.find().lean();
  assert.equal(held.reduce((n, row) => n + row.amountSyp, 0), 500);
  assert.ok(held.every(row => row.reconciliationId && row.allocationRunId));
});

test('frozen delivery without beneficiary, missing contract and platform compensation fail closed with recorded blockers', async () => {
  await contracts.createAndActivate(admin.id, warehouse.id, { agreementReference: 'Synthetic fee without beneficiary',
    basis: 'net_pharmacy_invoice', deliveryFeeSyp: 1000, expectedRevision: 1, idempotencyKey: key() });
  await delivered(); await receive(150000);
  let read = await remittances.read(admin.id, warehouse.id);
  assert.equal(read.summary.ready, false);
  assert.equal(read.summary.blockers[0].code, 'CUSTODY_DELIVERY_BENEFICIARY_SOURCE_REQUIRED');
  const blocked = await remittances.reconcile(treasurer.id, warehouse.id, { idempotencyKey: key() });
  await assert.rejects(remittances.record(treasurer.id, warehouse.id, { reconciliationId: String(blocked._id), amountSyp: 50000,
    transferredAt: '2026-11-07T10:00:00Z', reference: 'Synthetic blocked transfer', idempotencyKey: key() }), { code: 'CUSTODY_RECONCILIATION_CHANGED' });
  // Corrupt only the synthetic evidence fixture to prove source checks, never a real contract.
  const secondInvoice = await Invoice.findOne({ 'terms.contractRevision': 2 }).lean();
  await require('../src/models/collectionContract.model').deleteOne({ _id: secondInvoice.terms.contractId });
  read = await remittances.read(admin.id, warehouse.id);
  assert.equal(read.summary.blockers[0].code, 'CUSTODY_FROZEN_CONTRACT_REQUIRED');
  assert.equal(await Entry.countDocuments({ kind: 'payment' }), 1);
});

test('FIFO legacy opening debt is paid first but cannot acquire invented commission or remittance terms', async () => {
  pharmacyUser = await User.create({ name: 'Legacy pharmacy', role: 'pharmacy', status: 'active', phone: '0988100088' });
  pharmacy = await Pharmacy.create({ userId: pharmacyUser.id, nameAr: 'قديم', nameEn: 'Legacy', ownerName: 'Test',
    phone: pharmacyUser.phone, address: 'Test', city: 'Latakia', areaType: 'city', addedBy: 'self' });
  const account = await ledger.resolveAccount(pharmacy.id, warehouse.id);
  await require('../src/utils/transaction').runInTransaction(session => ledger.postEntry({ account, kind: 'charge', amountSyp: 30000,
    source: { orderId: new mongoose.Types.ObjectId() }, createdBy: owner.id }, session));
  await delivered(); await receive(50000);
  const snapshot = await remittances.reconcile(treasurer.id, warehouse.id, { idempotencyKey: key() });
  assert.equal(snapshot.result.netWarehouseDueSyp, null);
  assert.equal(snapshot.result.blockers[0].code, 'CUSTODY_LEGACY_TERMS_REQUIRED');
  assert.equal((await Account.findById(account._id).lean()).balanceCache.syp, 80000);
});

test('24/48-hour custody clocks are from actual cash time even with late approval', async () => {
  const body = { ...evidence(100), actualReceivedAt: new Date(Date.now() - 49 * 3600000).toISOString() };
  const row = await receipts.record(collector.id, warehouse.id, body);
  await receipts.review(approver.id, warehouse.id, String(row.receipt.id), { decision: 'approved', idempotencyKey: key() });
  const read = await remittances.read(admin.id, warehouse.id);
  assert.equal(read.custody[0].targetMissed, true); assert.equal(read.custody[0].overdue, true);
  assert.equal(new Date(read.custody[0].targetRemittanceAt) - new Date(body.actualReceivedAt), 24 * 3600000);
  assert.equal(new Date(read.custody[0].deadlineAt) - new Date(body.actualReceivedAt), 48 * 3600000);
});

test('concurrent independent approvals serialize FIFO and create one payment per receipt', async () => {
  const first = await receipts.record(collector.id, warehouse.id, evidence(25000));
  const second = await receipts.record(collector.id, warehouse.id, evidence(25000));
  await Promise.all([first, second].map(row => receipts.review(approver.id, warehouse.id, String(row.receipt.id), { decision: 'approved', idempotencyKey: key() })));
  const read = await remittances.read(admin.id, warehouse.id);
  assert.equal(read.summary.netWarehouseDueSyp, 49000);
  assert.equal(await Payment.countDocuments(), 2); assert.equal(await Entry.countDocuments({ kind: 'payment' }), 2);
  assert.equal(await Custody.countDocuments(), 2);
  assert.equal(await Audit.countDocuments({ action: 'collection.receipt_approved' }), 2);
});

async function revokeDuring(actor, action, work) {
  const grant = await Grant.findOne({ actorId: actor.id, action }).lean();
  const originalUpdate = Grant.updateOne;
  let revoked = false;
  Grant.updateOne = function(filter, update, options) {
    if (!revoked && String(filter._id) === String(grant._id) && update.$inc?.authorizationRevision) {
      revoked = true;
      return (async () => {
        await grants.revoke(admin.id, warehouse.id, String(grant._id), { reason: 'Synthetic concurrent revocation', idempotencyKey: key() });
        return originalUpdate.call(Grant, filter, update, options);
      })();
    }
    return originalUpdate.call(Grant, filter, update, options);
  };
  try { await assert.rejects(work(), { code: 'FENIQ_COLLECTION_GRANT_REQUIRED' }); }
  finally { Grant.updateOne = originalUpdate; }
  assert.equal(revoked, true);
}

test('revocation racing cash recording prevents even pending evidence and audit from committing', async () => {
  await revokeDuring(collector, ACTIONS.RECORD_FENIQ, () => receipts.record(collector.id, warehouse.id, evidence(100)));
  assert.equal(await Receipt.countDocuments(), 0); assert.equal(await Payment.countDocuments(), 0);
  assert.equal(await Audit.countDocuments({ action: 'collection.receipt_submitted' }), 0);
});

test('revocation racing approver and transfer confirmation leaves no half-approved financial effect', async () => {
  await receive(50000); const { movement } = await transfer();
  await revokeDuring(accountant, ACTIONS.CONFIRM_REMITTANCE, () => decision(movement));
  assert.equal((await Remittance.findById(movement._id).lean()).status, 'pending');
  assert.equal((await remittances.read(admin.id, warehouse.id)).summary.netWarehouseDueSyp, 49000);
  assert.equal(await Audit.countDocuments({ action: 'collection.remittance_confirmed' }), 0);
  const pending = await receipts.record(collector.id, warehouse.id, evidence(1));
  await revokeDuring(approver, ACTIONS.APPROVE_FENIQ, () => receipts.review(approver.id, warehouse.id, String(pending.receipt.id), { decision: 'approved', idempotencyKey: key() }));
  assert.equal((await Receipt.findById(pending.receipt.id).lean()).status, 'pending');
  assert.equal(await Payment.countDocuments(), 1);
});

test('blocked net across a time boundary never shifts already-held commission or permits collecting it twice', async t => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  try {
    await receive(100001); // One SYP has no invoice yet; net remains blocked.
    assert.equal((await remittances.read(admin.id, warehouse.id)).summary.ready, false);
    const Withholding = require('../src/models/feniqRemittance.model').Withholding;
    assert.equal((await Withholding.findOne().lean()).amountSyp, 1000);
    t.mock.timers.setTime(start + 2 * 3600000);
    await delivered(); // Assign the spare SYP without moving the old commission.
    const period = { from: new Date(start - 3600000), to: new Date(start + 3600000) };
    const cash = require('../src/services/commissionCollection.service');
    const { summary } = await cash.getWarehouseCommissionDetail(warehouse.id, period);
    assert.equal(summary.commissionOwedSyp, 1000); assert.equal(summary.heldByFeniqSyp, 1000);
    assert.equal(summary.currentCashOutstandingSyp, 0); assert.equal(summary.outstandingSyp, 0);
    assert.equal(summary.custodyUnreconciled, false);
    await assert.rejects(cash.recordCollection({ warehouseId: warehouse.id, actorId: admin.id,
      periodFrom: period.from, periodTo: period.to, amountSyp: 1000, method: 'cash', idempotencyKey: key() }), { code: 'FENIQ_COMMISSION_ALREADY_HELD' });
  } finally { t.mock.timers.reset(); }
});

test('qualifying an older warehouse receipt appends a signed one-lira withholding correction and carries net forward', async () => {
  const payment = await require('../src/services/payment.service').createPayment(warehouse.id, accountant.id,
    { pharmacyId: pharmacy.id, amount: 25, currency: 'SYP', paidAt: '2026-11-06T10:00:00Z', idempotencyKey: key() });
  await receive(25);
  const { snapshot, movement } = await transfer();
  assert.equal(snapshot.result.feniqSyp, 1); assert.equal(snapshot.result.netWarehouseDueSyp, 24);
  await decision(movement);
  const proofs = require('../src/services/paymentProof.service');
  const proof = await proofs.submit(accountant.id, payment.id, { proofReference: 'Synthetic warehouse cash', idempotencyKey: key() });
  const approval = await proofs.review(accountant.id, payment.id, String(proof.record._id), { decision: 'approved', idempotencyKey: key() });
  await require('../src/services/collectionSettlement.service').confirmWarehouseSettlement(admin.id, warehouse.id,
    { periodFrom: '2026-11-01', periodTo: '2026-11-07', proofReviewIds: [String(approval.record._id)], reference: 'Synthetic weekly settlement', idempotencyKey: key() });
  const current = await remittances.read(admin.id, warehouse.id);
  assert.equal(current.summary.feniqSyp, 0); assert.equal(current.summary.netWarehouseDueSyp, 1);
  const held = await require('../src/models/feniqRemittance.model').Withholding.find().sort({ _id: 1 }).lean();
  assert.deepEqual(held.map(h => h.amountSyp), [1, -1]);
  assert.ok(held[1].at >= held[0].at);
  assert.equal((await Remittance.findById(movement._id).lean()).amountSyp, 24);
  assert.equal(await Payment.countDocuments(), 2); assert.equal(await Entry.countDocuments({ kind: 'payment' }), 2);
});

test('returned source credit is non-cash; reuse preserves cash and carries the exact original commission budget', async () => {
  await receive(100000);
  const item = await require('../src/models/orderItem.model').findOne({ orderId: invoice._id });
  const { returnRequest } = await require('../src/services/return.service').createReturn({ pharmacyId: pharmacy.id, orderId: String(invoice._id),
    items: [{ orderItemId: item.id, quantity: 1, reasonType: 'damaged' }], notes: 'Synthetic exchange', images: [] });
  await require('../src/services/warehouseReturn.service').approveReturn(returnRequest._id, warehouse.id, owner.id);
  await delivered(); // Existing engine reserves and applies the returned credit.
  const current = await remittances.read(admin.id, warehouse.id);
  assert.equal(current.summary.grossCollectedSyp, 100000);
  assert.equal(current.summary.originalCommissionSyp, 2000); assert.equal(current.summary.feniqSyp, 1000);
  assert.equal(current.summary.netWarehouseDueSyp, 98000);
  assert.equal(await Entry.countDocuments({ kind: 'return_credit_application' }), 1);
  assert.equal(await Entry.countDocuments({ kind: 'payment' }), 1); assert.equal(await Payment.countDocuments(), 1);
});

test('platform-funded discounts and return clawbacks never fabricate an unlinked reimbursement in custody net', async () => {
  const code = await require('../src/services/adminDiscountCode.service').createCode(admin.id, { type: 'percentage', value: 10,
    startDate: new Date(Date.now() - 86400000).toISOString(), endDate: new Date(Date.now() + 86400000).toISOString() });
  let discounted = await orders.createOrder({ userId: pharmacyUser.id, pharmacyId: pharmacy.id, warehouseId: warehouse.id,
    items: [{ productId: product.id, quantity: 1 }], discountCode: code.code, idempotencyKey: key() });
  for (let i = 0; i < 3; i++) discounted = await warehouseOrders.advanceOrderStatus(discounted._id, warehouse.id, owner.id);
  await receive(190000);
  const first = await remittances.read(admin.id, warehouse.id);
  assert.equal(first.summary.netWarehouseDueSyp, null);
  assert.equal(first.summary.blockers[0].code, 'CUSTODY_PLATFORM_COMPENSATION_SOURCE_REQUIRED');
  const item = await require('../src/models/orderItem.model').findOne({ orderId: discounted._id });
  const { returnRequest } = await require('../src/services/return.service').createReturn({ pharmacyId: pharmacy.id, orderId: String(discounted._id),
    items: [{ orderItemId: item.id, quantity: 1, reasonType: 'damaged' }], notes: 'Synthetic admin-funded return', images: [] });
  await require('../src/services/warehouseReturn.service').approveReturn(returnRequest._id, warehouse.id, owner.id);
  assert.equal((await ReturnCredit.findOne().lean()).compensationClawbackSyp, 10000);
  assert.equal((await remittances.read(admin.id, warehouse.id)).summary.netWarehouseDueSyp, null);
  assert.equal(await Payment.countDocuments(), 1);
});

test('recorded FX and exact idempotency survive rate changes and lost responses without a second posting', async () => {
  const body = evidence(50000);
  const pending = await receipts.record(collector.id, warehouse.id, body);
  await ExchangeRate.updateOne({ _id: 'singleton' }, { $set: { usdToSyp: 20000 } });
  assert.equal((await receipts.record(collector.id, warehouse.id, body)).replay, true);
  const approval = { decision: 'approved', idempotencyKey: key() };
  const posted = await receipts.review(approver.id, warehouse.id, String(pending.receipt.id), approval);
  assert.equal((await receipts.review(approver.id, warehouse.id, String(pending.receipt.id), approval)).replay, true);
  const payment = await Payment.findById(posted.receipt.paymentId).lean();
  assert.equal(payment.fx.rate, 10000); assert.equal(payment.amountSyp, 50000); assert.equal(payment.amountUsd, 5);
  assert.equal((await Entry.findById(payment.ledgerEntryId).lean()).fx.rate, 10000);
  assert.equal(await Payment.countDocuments(), 1);
  assert.throws(() => receipts.receiptDate('2026-02-30T10:00:00Z'), { code: 'INVALID_ACTUAL_CASH_TIME' });
});

test('isolated backup/restore preserves ledger, custody, remittance evidence and unique idempotency indexes', async () => {
  await receive(50000); const { movement } = await transfer(); await decision(movement);
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const { EJSON } = require('bson');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'feniq-synthetic-custody-backup-'));
  const source = mongoose.connection.db;
  const restored = source.client.db('feniq_remittance_synthetic_restore');
  process.env.FENIQ_COLLECTION_RECEIPTS_ENABLED = 'false';
  try {
    const collections = [];
    for (const meta of await source.listCollections({ type: 'collection' }).toArray()) {
      if (meta.name.startsWith('system.')) continue;
      collections.push({ name: meta.name, indexes: await source.collection(meta.name).indexes(), documents: [] });
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const collection of collections) collection.documents = await source.collection(collection.name).find({}, { session }).sort({ _id: 1 }).toArray();
      }, { readConcern: { level: 'snapshot' } });
    } finally { await session.endSession(); }
    const file = path.join(directory, 'synthetic-financial-backup.ejson');
    await fs.writeFile(file, EJSON.stringify(collections), { mode: 0o600, flag: 'wx' });
    for (const collection of EJSON.parse(await fs.readFile(file, 'utf8'))) {
      await restored.createCollection(collection.name);
      if (collection.documents.length) await restored.collection(collection.name).insertMany(collection.documents);
      for (const index of collection.indexes.filter(index => index.name !== '_id_')) {
        const { key: keys, v: _version, ns: _namespace, ...options } = index;
        await restored.collection(collection.name).createIndex(keys, options);
      }
      assert.deepEqual(await restored.collection(collection.name).find().sort({ _id: 1 }).toArray(), collection.documents);
    }
    const restoredPayments = await restored.collection(Payment.collection.name).find().toArray();
    assert.equal(restoredPayments.length, 1);
    const restoredMovements = await restored.collection(Remittance.collection.name).find().toArray();
    assert.equal(restoredMovements.length, 1); assert.equal(restoredMovements[0].amountSyp, 49000);
    assert.equal(restoredMovements[0].status, 'confirmed');
    await assert.rejects(restored.collection(Remittance.collection.name).insertOne({ ...restoredMovements[0], _id: new mongoose.Types.ObjectId() }), { code: 11000 });
    const restoredAccount = await restored.collection(Account.collection.name).findOne();
    const restoredEntries = await restored.collection(Entry.collection.name).find({ accountId: restoredAccount._id }).toArray();
    assert.equal(restoredEntries.reduce((n, e) => n + (e.direction === 'debit' ? e.amountSyp : -e.amountSyp), 0), restoredAccount.balanceCache.syp);
  } finally {
    process.env.FENIQ_COLLECTION_RECEIPTS_ENABLED = 'true';
    await restored.dropDatabase(); await fs.rm(directory, { recursive: true, force: true });
  }
});
