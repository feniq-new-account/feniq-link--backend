process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'synthetic-collection-ledger-test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const http = require('node:http');
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
const Order = require('../src/models/order.model');
const Entry = require('../src/models/ledgerEntry.model');
const Account = require('../src/models/ledgerAccount.model');
const Payment = require('../src/models/payment.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const OrderItem = require('../src/models/orderItem.model');
const returns = require('../src/services/return.service');
const warehouseReturns = require('../src/services/warehouseReturn.service');
const { ReturnCredit, ReturnCreditUse } = require('../src/models/collectionAccounting.model');
const { Epoch, Invoice, Position, AllocationRun, Recognition, Event, Settlement } = require('../src/models/collectionAccounting.model');
const contracts = require('../src/services/collectionContract.service');
const orders = require('../src/services/order.service');
const warehouseOrders = require('../src/services/warehouseOrder.service');
const payments = require('../src/services/payment.service');
const proofs = require('../src/services/paymentProof.service');
const settlements = require('../src/services/collectionSettlement.service');
const credits = require('../src/services/pharmacyCredit.service');
const ledger = require('../src/services/ledger.service');
const settlementReport = require('../src/services/settlement.service');
const commissionCash = require('../src/services/commissionCollection.service');
const { sumRepCommission } = require('../src/services/repCommissionTotals.service');
const { runInTransaction } = require('../src/utils/transaction');
let admin, owner, accountant, pharmacyUser, warehouse, pharmacy, product, rep;
let serial = 0;
let server, base;
const key = () => `synthetic-${++serial}`;
const contractBody = (expectedRevision = 0) => ({ agreementReference: 'synthetic-existing-agreement',
  basis: 'net_pharmacy_invoice', deliveryFeeSyp: null, expectedRevision, idempotencyKey: key() });
test.before(async () => {
  await startMemoryMongo({ dbName: 'collection-ledger-isolated', orderingOpen: true });
  await ledger.ensureFinancialIndexes();
  await Payment.createIndexes();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});
async function call(actor, method, path, body) {
  const token = actor ? jwt.sign({ sub: String(actor._id) }, env.jwtSecret, { expiresIn: '1h' }) : null;
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
test.beforeEach(async () => {
  for (const collection of await mongoose.connection.db.collections()) await collection.deleteMany({});
  await mongoose.connection.collection('platformsettings').insertOne({ key: 'pharmacistLaunch',
    value: { mode: 'ordering_open', message: 'Synthetic isolated sales', revision: 1 } });
  [admin, owner, accountant, pharmacyUser] = await User.create([
    { name: 'Synthetic admin', phone: '0991000001', role: 'admin', status: 'active' },
    { name: 'Synthetic owner', phone: '0991000002', role: 'warehouse', warehouseRole: 'owner', status: 'active' },
    { name: 'Synthetic accountant', phone: '0991000003', role: 'warehouse', warehouseRole: 'accountant', status: 'active' },
    { name: 'Synthetic pharmacy', phone: '0991000004', role: 'pharmacy', status: 'active' },
  ]);
  warehouse = await Warehouse.create({ userId: owner._id, memberUserIds: [accountant._id], nameAr: 'اختبار', nameEn: 'Synthetic',
    phone: '0991000002', address: 'Test', city: 'Test', deliveryType: 'self', requireDeliverySealPhoto: false,
    isActive: true, discountRate: 0, commissionRate: 0 });
  pharmacy = await Pharmacy.create({ userId: pharmacyUser._id, nameAr: 'اختبار', nameEn: 'Synthetic',
    ownerName: 'Test', phone: '0991000004', city: 'Test', address: 'Test', areaType: 'city', addedBy: 'self' });
  product = await Product.create({ warehouseId: warehouse._id, nameAr: 'اختبار', nameEn: 'Synthetic medicine', manufacturerAr: 'Test',
    price: 10, unitAr: 'علبة', unitEn: 'box', isActive: true, isAvailable: true });
  const repUser = await User.create({ name: 'Synthetic rep', phone: '0991000005', role: 'rep', status: 'active' });
  rep = await Rep.create({ warehouseId: warehouse._id, userId: repUser._id, name: 'Synthetic rep', phone: '0991000005', commissionRate: 2 });
  await Assignment.create({ warehouseId: warehouse._id, pharmacyId: pharmacy._id, repId: rep._id, assignedBy: owner._id, active: true });
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });
});
async function order(quantity = 1) {
  return orders.createOrder({ userId: pharmacyUser._id, pharmacyId: pharmacy._id, warehouseId: warehouse._id,
    items: [{ productId: String(product._id), quantity }], idempotencyKey: key() });
}
async function deliver(value) {
  let current = value;
  for (let i = 0; i < 3; i++) current = await warehouseOrders.advanceOrderStatus(current._id, warehouse._id, owner._id);
  return current;
}
async function payment(amount) {
  return payments.createPayment(warehouse._id, accountant._id, { pharmacyId: String(pharmacy._id), amount,
    currency: 'SYP', paidAt: '2026-11-06T10:00:00Z', idempotencyKey: key() });
}
async function approve(receipt) {
  const proof = await proofs.submit(accountant._id, receipt._id, { proofReference: 'synthetic-reference', idempotencyKey: key() });
  const result = await proofs.review(accountant._id, receipt._id, proof.record._id, { decision: 'approved', idempotencyKey: key() });
  return result.record;
}
const settlementBody = reviews => ({ periodFrom: '2026-11-01', periodTo: '2026-11-07',
  proofReviewIds: reviews.map(r => String(r._id)), reference: 'synthetic-weekly-settlement', idempotencyKey: key() });
async function total(field = 'feniqSyp') {
  return (await Event.find().lean()).reduce((n, e) => n + e[field], 0);
}

test('new contract snapshots existing rates and leaves historical orders on the legacy engine', async () => {
  const old = await order();
  const body = contractBody();
  const contract = await contracts.createAndActivate(admin._id, warehouse._id, body);
  assert.equal(contract.contract.repRates[0].rateBps, 200);
  assert.equal((await contracts.createAndActivate(admin._id, warehouse._id, body)).replay, true);
  const fresh = await order();
  assert.equal(fresh.commissionEngine, 'collection_v2');
  assert.equal(fresh.collectionCommission.originalCommissionSyp, 2000);
  assert.equal(fresh.collectionCommission.invoiceSyp, 100000);
  assert.equal(fresh.collectionCommission.contractRevision, 1);
  assert.equal(fresh.commissionAmount, 0); assert.equal(fresh.repCommission, null);
  const original = await Order.findById(old._id);
  assert.equal(original.commissionEngine, 'legacy_delivery');
  assert.equal(original.commissionAmount, 500); assert.equal(original.repCommission.pharmacyAmount, 500);
  await Rep.updateOne({ _id: rep._id }, { $set: { commissionRate: 5 } });
  assert.equal((await order()).collectionCommission.originalCommissionSyp, 2000);
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody(1));
  assert.equal((await order()).collectionCommission.originalCommissionSyp, 5000);
  assert.equal((await Order.findById(fresh._id)).collectionCommission.originalCommissionSyp, 2000);
});
test('delivery charges once with no legacy quarter, and warehouse cash needs approved proof AND settlement to accrue', async () => {
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  const delivered = await deliver(await order());
  assert.equal(await Invoice.countDocuments(), 1); assert.equal(await Epoch.countDocuments(), 1);
  assert.equal(await credits.balanceFor(pharmacy._id, warehouse._id), 0);
  assert.equal(await total(), 0);
  const receipt = await payment(50000);
  assert.equal(await total(), 0);
  const review = await approve(receipt);
  assert.equal(await total(), 0, 'proof alone cannot bypass settlement');
  const before = await Account.findOne({ pharmacyId: pharmacy._id, warehouseId: warehouse._id }).lean();
  const result = await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([review]));
  assert.equal(result.settlement.cadence, 'weekly'); assert.equal(await total(), 500);
  assert.equal(await total('repSyp'), 500);
  const after = await Account.findById(before._id).lean();
  assert.equal(after.balanceCache.syp, 50000); assert.equal(after.seqCounter, before.seqCounter);
  assert.equal(await Payment.countDocuments(), 1); assert.equal(await Entry.countDocuments({ kind: 'charge' }), 1);
  assert.equal((await Invoice.findOne()).orderId.toString(), delivered._id.toString());
  assert.equal((await ledger.verifyAccount(after._id)).ok, true);
});
test('FIFO new cash clears the verified legacy opening debt before earning on the new invoice, without allocating old receipts', async () => {
  const account = await ledger.resolveAccount(pharmacy._id, warehouse._id);
  await runInTransaction(session => ledger.postEntry({ account, kind: 'charge', amountSyp: 30000,
    source: { orderId: new mongoose.Types.ObjectId() }, createdBy: owner._id }, session));
  await payment(10000); // historical unallocated cash: opening legacy debt20000
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  await deliver(await order());
  const epoch = await Epoch.findOne().lean();
  assert.equal(epoch.openingBalanceSyp, 20000); assert.equal(epoch.openingSequence, 2);
  const receipt = await payment(50000);
  const review = await approve(receipt);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([review]));
  assert.equal(await total(), 300, 'only30000 of new cash reaches the new invoice');
  const run = await AllocationRun.findOne().sort({ revision: -1 }).lean();
  assert.equal(run.allocations[0].engine, 'legacy_opening'); assert.equal(run.allocations[0].amountSyp, 20000);
  assert.equal(run.allocations[1].amountSyp, 30000);
  assert.equal(new Set(run.allocations.map(a => String(a.paymentId))).size, 1);
  assert.equal(await Entry.countDocuments(), 4, 'no migration or second receipt entry');
});
test('retries and concurrent settlement confirmation create one eligibility record and one accrual', async () => {
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  await deliver(await order());
  const review = await approve(await payment(100000));
  const body = settlementBody([review]);
  const results = await Promise.all([1, 2, 3].map(() => settlements.confirmWarehouseSettlement(admin._id, warehouse._id, body)));
  assert.equal(results.filter(r => !r.replay).length, 1); assert.equal(await total(), 1000);
  assert.equal(await Settlement.countDocuments(), 1); assert.equal(await Recognition.countDocuments(), 1);
  assert.equal(await Event.countDocuments(), 1);
  await assert.rejects(settlements.confirmWarehouseSettlement(admin._id, warehouse._id, { ...body, reference: 'different' }), { code: 'IDEMPOTENCY_KEY_REUSED' });
});
test('reversing an approved receipt appends negative commission and reassigns surviving cash FIFO without modifying old runs', async () => {
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  const first = await deliver(await order()); await deliver(await order());
  const payment1 = await payment(100000), payment2 = await payment(50000);
  const reviews = [await approve(payment1), await approve(payment2)];
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody(reviews));
  assert.equal(await total(), 1500);
  const before = await AllocationRun.findOne().sort({ revision: -1 }).lean();
  await payments.reversePayment(payment1._id, warehouse._id, accountant._id,
    { reason: 'Synthetic receipt correction', idempotencyKey: key() });
  assert.equal(await total(), 500);
  const after = await AllocationRun.findOne().sort({ revision: -1 }).lean();
  assert.equal(after.allocations.length, 1); assert.equal(String(after.allocations[0].orderId), String(first._id));
  assert.equal(after.allocations[0].amountSyp, 50000);
  assert.deepEqual((await AllocationRun.findById(before._id).lean()).allocations, before.allocations);
  const account = await Account.findOne(); assert.equal((await ledger.verifyAccount(account._id)).ok, true);
  assert.ok((await Event.find().lean()).some(e => e.feniqSyp < 0));
});
test('warehouse owner/accountant/pharmacy cannot activate contracts or confirm platform settlement; tenant evidence cannot cross warehouses', async () => {
  for (const actor of [owner, accountant, pharmacyUser]) {
    await assert.rejects(contracts.createAndActivate(actor._id, warehouse._id, contractBody()), { statusCode: 403 });
  }
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  await deliver(await order());
  const review = await approve(await payment(100000));
  for (const actor of [owner, accountant, pharmacyUser]) {
    await assert.rejects(settlements.confirmWarehouseSettlement(actor._id, warehouse._id, settlementBody([review])), { statusCode: 403 });
  }
  await assert.rejects(settlements.confirmWarehouseSettlement(admin._id, new mongoose.Types.ObjectId(), settlementBody([review])), { code: 'WAREHOUSE_NOT_FOUND' });
  assert.equal(await total(), 0); assert.equal(await Settlement.countDocuments(), 0);
});
test('reversing pre-cutover cash restores legacy priority and appends a correction to newer commission', async () => {
  const account = await ledger.resolveAccount(pharmacy._id, warehouse._id);
  await runInTransaction(session => ledger.postEntry({ account, kind: 'charge', amountSyp: 30000,
    source: { orderId: new mongoose.Types.ObjectId() }, createdBy: owner._id }, session));
  const historical = await payment(30000);
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  await deliver(await order());
  const current = await payment(100000);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(current)]));
  assert.equal(await total(), 1000);
  const originalEpoch = await Epoch.findOne().lean();
  await payments.reversePayment(historical._id, warehouse._id, accountant._id,
    { reason: 'Synthetic historical receipt correction', idempotencyKey: key() });
  assert.equal(await total(), 700);
  const run = await AllocationRun.findOne().sort({ revision: -1 }).lean();
  assert.equal(run.allocations[0].engine, 'legacy_opening'); assert.equal(run.allocations[0].amountSyp, 30000);
  assert.equal(run.allocations[1].amountSyp, 70000);
  assert.deepEqual(await Epoch.findOne().lean(), originalEpoch, 'the checkpoint itself is never rewritten');
  assert.equal((await ledger.verifyAccount(account._id)).ok, true);
});
async function returnScenario() {
  await Product.updateOne({ _id: product._id }, { $set: { price: 2 } });
  await Rep.updateOne({ _id: rep._id }, { $set: { commissionRate: 10 } });
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  return deliver(await order(5)); // synthetic invoice100000 / original commission10000
}
async function returnOne(source) {
  const line = await OrderItem.findOne({ orderId: source._id });
  const { returnRequest: request } = await returns.createReturn({ pharmacyId: pharmacy._id, orderId: String(source._id),
    items: [{ orderItemId: String(line._id), quantity: 1, reasonType: 'wrong_item' }], images: [] });
  return warehouseReturns.approveReturn(request._id, warehouse._id, owner._id);
}
test('partial cash and partial return keep original debt intact and reach net8000 commission after full cash', async () => {
  const source = await returnScenario();
  const first = await approve(await payment(50000));
  const recorded = await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([first]));
  const frozenSettlement = await Settlement.findById(recorded.settlement._id).lean();
  assert.equal(await total('originalCommissionSyp'), 5000);
  const before = await Account.findOne().lean();
  const result = await returnOne(source);
  assert.equal(result.creditEntry, null); assert.equal(result.returnRequest.creditSyp, 20000);
  assert.ok(result.returnRequest.creditGrantId);
  assert.equal(result.returnRequest.creditTreatment, 'future_invoice_or_exchange');
  assert.equal((await Account.findById(before._id)).balanceCache.syp, before.balanceCache.syp);
  assert.equal(await Entry.countDocuments({ kind: 'return_credit' }), 0);
  assert.equal(await total('originalCommissionSyp'), 4000);
  assert.equal(await total(), 2000);
  assert.deepEqual(await Settlement.findById(frozenSettlement._id).lean(), frozenSettlement);
  const last = await approve(await payment(50000));
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([last]));
  assert.equal(await total('originalCommissionSyp'), 8000); assert.equal(await total(), 4000);
  assert.equal((await Account.findOne()).balanceCache.syp, 0);
});
test('using returned credit in an exchange reuses only source-backed cash, never a second receipt or double commission', async () => {
  const source = await returnScenario();
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(await payment(50000))]));
  await returnOne(source);
  const replacement = await order();
  assert.equal(replacement.finalPrice, 20000); assert.equal(replacement.returnCreditReservedSyp, 20000);
  await deliver(replacement);
  assert.equal(await ReturnCredit.countDocuments(), 1); assert.equal(await ReturnCreditUse.countDocuments(), 1);
  assert.equal(await Payment.countDocuments(), 1);
  assert.equal(await Entry.countDocuments({ kind: 'return_credit_application' }), 1);
  assert.equal((await Account.findOne()).balanceCache.syp, 50000);
  //4000 on retained original goods +1000 from the already-collected half of
  // the returned credit used for replacement. No second cash receipt.
  assert.equal(await total('originalCommissionSyp'), 5000);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(await payment(50000))]));
  assert.equal(await total('originalCommissionSyp'), 10000);
  assert.equal(await Payment.countDocuments(), 2); assert.equal((await Account.findOne()).balanceCache.syp, 0);
  const invoice = await Invoice.findOne({ orderId: replacement._id });
  assert.equal((await Event.find({ invoiceId: invoice._id }).lean()).reduce((n, e) => n + e.originalCommissionSyp, 0), 2000);
  assert.equal((await ledger.verifyAccount((await Account.findOne())._id)).ok, true);
});
test('concurrent next orders cannot spend returned credit twice, and cancellation releases its reservation', async () => {
  const source = await returnScenario(); await returnOne(source);
  const children = await Promise.all([order(), order()]);
  assert.equal(children.reduce((n, row) => n + row.returnCreditReservedSyp, 0), 20000);
  const reserved = children.find(row => row.returnCreditReservedSyp > 0);
  await orders.cancelOrder(String(reserved._id), pharmacy._id, pharmacyUser._id);
  assert.equal((await order()).returnCreditReservedSyp, 20000);
  assert.equal(await Entry.countDocuments({ kind: 'return_credit_application' }), 0);
});
test('reversing source cash after an exchange corrects parent and child commissions without deleting used credit', async () => {
  const source = await returnScenario();
  const receipt = await payment(100000);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(receipt)]));
  await returnOne(source);
  await deliver(await order());
  assert.equal(await total('originalCommissionSyp'), 10000);
  const application = await Entry.findOne({ kind: 'return_credit_application' }).lean();
  await payments.reversePayment(receipt._id, warehouse._id, accountant._id,
    { reason: 'Synthetic source cash correction', idempotencyKey: key() });
  assert.equal(await total('originalCommissionSyp'), 0);
  assert.deepEqual(await Entry.findById(application._id).lean(), application);
  assert.equal((await Account.findOne()).balanceCache.syp, 100000);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(await payment(100000))]));
  assert.equal(await total('originalCommissionSyp'), 10000);
  assert.equal(await Entry.countDocuments({ kind: 'return_credit_application' }), 1);
  assert.equal((await ledger.verifyAccount((await Account.findOne())._id)).ok, true);
});
test('odd-lira rounding cannot generate new commission by repeatedly exchanging the same source credit', async () => {
  await ExchangeRate.updateOne({ _id: 'singleton' }, { $set: { usdToSyp: 100 } });
  await Product.updateOne({ _id: product._id }, { $set: { price: 0.06 } });
  await Rep.updateOne({ _id: rep._id }, { $set: { commissionRate: 10 } });
  await Pharmacy.updateOne({ _id: pharmacy._id }, { $set: { areaType: 'rural' } });
  const small = await Product.create({ warehouseId: warehouse._id, nameAr: 'صغير', nameEn: 'Synthetic five-lira',
    manufacturerAr: 'Test', price: 0.05, unitAr: 'علبة', unitEn: 'box', isActive: true, isAvailable: true });
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  const source = await deliver(await orders.createOrder({ userId: pharmacyUser._id, pharmacyId: pharmacy._id,
    warehouseId: warehouse._id, items: [{ productId: String(product._id), quantity: 1 }, { productId: String(small._id), quantity: 1 }], idempotencyKey: key() }));
  assert.equal(source.finalPrice, 11); assert.equal(source.collectionCommission.originalCommissionSyp, 1);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(await payment(11))]));
  async function returnSmall(invoice) {
    const item = await OrderItem.findOne({ orderId: invoice._id, productId: small._id });
    const { returnRequest } = await returns.createReturn({ pharmacyId: pharmacy._id, orderId: String(invoice._id),
      items: [{ orderItemId: String(item._id), quantity: 1, reasonType: 'wrong_item' }], images: [] });
    await warehouseReturns.approveReturn(returnRequest._id, warehouse._id, owner._id);
  }
  await returnSmall(source);
  assert.equal((await ReturnCredit.findOne()).returnedCommissionSyp, 0);
  let child;
  for (let i = 0; i < 2; i++) {
    child = await deliver(await orders.createOrder({ userId: pharmacyUser._id, pharmacyId: pharmacy._id,
      warehouseId: warehouse._id, items: [{ productId: String(small._id), quantity: 1 }], idempotencyKey: key() }));
    assert.equal(child.finalPrice, 5); assert.equal(child.collectionCommission.originalCommissionSyp, 1);
    assert.equal(await total('originalCommissionSyp'), 1, 'same11 cash must never become2 or3 commission');
    if (i === 0) await returnSmall(child);
  }
  const run = await AllocationRun.findOne().sort({ revision: -1 }).lean();
  const creditRows = run.allocations.filter(row => row.returnCreditUseId);
  assert.equal(creditRows.length, 2);
  for (const row of creditRows) assert.ok(await ReturnCreditUse.exists({ _id: row.returnCreditUseId }));
  assert.equal(await Payment.countDocuments(), 1);
  assert.equal((await Account.findOne()).balanceCache.syp, 0);
});
test('city beneficiary rounding remains1/1 across two children, a grandchild and cash reversal', async () => {
  await ExchangeRate.updateOne({ _id: 'singleton' }, { $set: { usdToSyp: 100 } });
  await Product.updateOne({ _id: product._id }, { $set: { price: 0.10 } });
  await Rep.updateOne({ _id: rep._id }, { $set: { commissionRate: 10 } });
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  const source = await deliver(await order(2));
  const receipt = await payment(20);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(receipt)]));
  async function returnWhole(invoice) {
    const item = await OrderItem.findOne({ orderId: invoice._id });
    const { returnRequest } = await returns.createReturn({ pharmacyId: pharmacy._id, orderId: String(invoice._id),
      items: [{ orderItemId: String(item._id), quantity: item.quantity, reasonType: 'wrong_item' }], images: [] });
    await warehouseReturns.approveReturn(returnRequest._id, warehouse._id, owner._id);
  }
  await returnWhole(source);
  const first = await order(), second = await order();
  await deliver(second); await deliver(first); // reservation and delivery order differ
  assert.equal(await total('originalCommissionSyp'), 2);
  assert.equal(await total(), 1); assert.equal(await total('repSyp'), 1);
  await returnWhole(second); await deliver(await order());
  assert.equal(await total(), 1); assert.equal(await total('repSyp'), 1);
  await payments.reversePayment(receipt._id, warehouse._id, accountant._id,
    { reason: 'Synthetic inherited-source correction', idempotencyKey: key() });
  assert.equal(await total(), 0); assert.equal(await total('repSyp'), 0);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(await payment(20))]));
  assert.equal(await total(), 1); assert.equal(await total('repSyp'), 1);
});
test('HTTP contract/settlement writers and actual invoice/journal reader preserve tenant roles and exact posted amounts', async () => {
  const config = contractBody();
  const path = `/admin/collection-accounting/warehouses/${warehouse._id}`;
  assert.equal((await call(owner, 'POST', `${path}/contracts`, config)).status, 403);
  const activated = await call(admin, 'POST', `${path}/contracts`, config);
  assert.equal(activated.status, 201); assert.equal(activated.body.appliesTo, 'new_orders_only');
  const replay = await call(admin, 'POST', `${path}/contracts`, config);
  assert.equal(replay.status, 200); assert.equal(replay.headers.get('idempotent-replay'), 'true');
  await deliver(await order());
  const receipt = await payment(50000), proof = await approve(receipt), body = settlementBody([proof]);
  assert.equal((await call(accountant, 'POST', `${path}/settlements`, body)).status, 403);
  const confirmed = await call(admin, 'POST', `${path}/settlements`, body);
  assert.equal(confirmed.status, 201); assert.equal(confirmed.body.pharmacyDebtChanged, false);
  const read = await call(owner, 'GET', '/warehouse/collection-accounting?period=month&state=partial&search=0991000004');
  assert.equal(read.status, 200); assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.equal(read.body.summary.feniqSyp, 500); assert.equal(read.body.summary.repSyp, 500);
  assert.equal(read.body.invoices.length, 1); assert.equal(read.body.invoices[0].state, 'partial');
  assert.equal(read.body.invoices[0].cashRecordedSyp, 50000); assert.equal(read.body.invoices[0].outstandingSyp, 50000);
  assert.equal(read.body.events[0].feniqSyp, 500); assert.equal(read.body.events[0].targetOriginalCommissionSyp, 1000);
  assert.equal((await call(pharmacyUser, 'GET', '/warehouse/collection-accounting')).status, 403);
  assert.equal((await call(admin, 'GET', '/warehouse/collection-accounting')).status, 403);
  assert.equal((await call(admin, 'GET', path)).status, 200);
  assert.equal((await call(null, 'GET', '/warehouse/collection-accounting')).status, 401);
  for (const suffix of ['?warehouseId=other', '?state=unknown', '?after=invalid', '?search=' + 'x'.repeat(121)]) {
    assert.equal((await call(owner, 'GET', '/warehouse/collection-accounting' + suffix)).status, 400);
  }
  const other = await User.create({ name: 'Other accountant', phone: '0991000099', role: 'warehouse', status: 'active', warehouseRole: 'accountant' });
  await Warehouse.create({ userId: other._id, nameAr: 'آخر', nameEn: 'Other', phone: '0991000099', address: 'Test', city: 'Test', deliveryType: 'self' });
  const foreign = await call(other, 'GET', '/warehouse/collection-accounting');
  assert.equal(foreign.status, 200); assert.equal(foreign.body.events.length, 0); assert.equal(foreign.body.invoices.length, 0);
  assert.equal((await call(other, 'POST', `${path}/settlements`, settlementBody([proof]))).status, 403);
});
test('a corrupted materialized invoice cannot appear as a fresh authoritative commission balance', async () => {
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  await deliver(await order());
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(await payment(50000))]));
  await Position.updateOne({}, { $inc: { feniqSyp: 1 } }); // isolated corruption fixture only
  const read = await call(owner, 'GET', '/warehouse/collection-accounting');
  assert.equal(read.status, 409); assert.equal(read.body.code, 'COLLECTION_ACCOUNT_RECONCILIATION_REQUIRED');
  assert.equal(read.body.invoices, undefined);
});
test('warehouse settlement, admin commission and rep totals use the same posted journal; a paid old settlement remains unchanged after a return', async () => {
  const source = await returnScenario();
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([await approve(await payment(50000))]));
  const initial = await settlementReport.getSettlementForWarehouse(warehouse._id);
  assert.equal(initial.totals.netCommissionSyp, 2500);
  const cash = await commissionCash.recordCollection({ idempotencyKey: require('node:crypto').randomUUID(), warehouseId: warehouse._id,
    periodFrom: initial.period.from.toISOString(), periodTo: initial.period.to.toISOString(),
    amountSyp: 2500, actorId: admin._id, reference: 'Synthetic actual commission receipt' });
  const frozen = cash.toObject();
  await returnOne(source);
  const report = await settlementReport.getSettlementForWarehouse(warehouse._id);
  const adminReport = await commissionCash.getWarehouseCommissionDetail(warehouse._id);
  assert.equal(report.totals.netCommissionSyp, 2000);
  assert.equal(report.totals.creditedSalesSyp, 20000);
  assert.equal(report.collectionCommission.collectionReturnIssuedSyp, 20000);
  const invoiceRow = report.rows.find(row => String(row.orderId) === String(source._id));
  assert.equal(invoiceRow.netCommissionSyp, 2000);
  assert.equal(invoiceRow.warehouseNetSyp, 78000);
  assert.equal(invoiceRow.creditedSyp, 20000);
  assert.equal(adminReport.summary.commissionOwedSyp, 2000);
  assert.equal(adminReport.summary.outstandingSyp, -500, 'known return correction offsets the next actual payment');
  const [repTotal] = await sumRepCommission({ warehouseId: warehouse._id, repId: rep._id });
  assert.equal(repTotal.feniqAmount, 2000); assert.equal(repTotal.repAmount, 2000);
  const cashModel = require('../src/models/commissionCollection.model');
  assert.deepEqual((await cashModel.findById(cash._id)).toObject(), frozen);
  const orderDetail = await call(owner, 'GET', `/warehouse/orders/${source._id}`);
  assert.equal(orderDetail.status, 200);
  assert.equal(orderDetail.body.order.collectionAccounting.feniqSyp, 2000);
  assert.equal(orderDetail.body.order.warehouseNetSyp, 78000);
  assert.equal(orderDetail.body.order.collectionAccounting.issuedReturnCreditSyp, 20000);
  await deliver(await order());
  const afterExchange = await settlementReport.getSettlementForWarehouse(warehouse._id);
  assert.equal(afterExchange.totals.grossSalesSyp - afterExchange.totals.creditedSalesSyp, 100000);
  assert.equal(afterExchange.totals.netCommissionSyp, 2500);
  assert.equal((await commissionCash.getWarehouseCommissionDetail(warehouse._id)).summary.outstandingSyp, 0);
});
test('invoice state filtering and server cursors return exact actual open/partial/paid records', async () => {
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  const oldest = await deliver(await order()), second = await deliver(await order()), third = await deliver(await order());
  await payment(150000);
  for (const [state, expected, outstanding] of [['paid', oldest, 0], ['partial', second, 50000], ['open', third, 100000]]) {
    const read = await call(accountant, 'GET', `/warehouse/collection-accounting?state=${state}`);
    assert.equal(read.status, 200); assert.equal(read.body.invoices.length, 1);
    assert.equal(read.body.invoices[0].orderId, String(expected._id)); assert.equal(read.body.invoices[0].outstandingSyp, outstanding);
    assert.equal(read.body.summary.invoiceStates[state], 1);
    assert.equal(read.body.invoices[0].accruedFeniqSyp, 0, 'posted cash has no accrual without proof and settlement');
  }
  for (let i = 0; i < 18; i++) await deliver(await order());
  const firstPage = await call(owner, 'GET', '/warehouse/collection-accounting');
  assert.equal(firstPage.body.invoices.length, 20); assert.equal(firstPage.body.invoicePagination.hasMore, true);
  const next = await call(owner, 'GET', `/warehouse/collection-accounting?invoiceAfter=${firstPage.body.invoicePagination.nextCursor}`);
  assert.equal(next.body.invoices.length, 1); assert.equal(next.body.invoicePagination.hasMore, false);
  assert.ok(!firstPage.body.invoices.some(row => row.id === next.body.invoices[0].id));
});

test('v2 returned admin-funded compensation is frozen and deducted exactly once for full and partial returns', async () => {
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  const codes = require('../src/services/adminDiscountCode.service');
  const code = await codes.createCode(admin._id, { type: 'percentage', value: 10,
    startDate: new Date(Date.now() - 86400000).toISOString(), endDate: new Date(Date.now() + 86400000).toISOString() });
  for (const quantity of [1, 5]) {
    const source = await deliver(await orders.createOrder({ userId: pharmacyUser._id, pharmacyId: pharmacy._id,
      warehouseId: warehouse._id, items: [{ productId: String(product._id), quantity: 5 }],
      discountCode: code.code, idempotencyKey: key() }));
    const line = await OrderItem.findOne({ orderId: source._id });
    const { returnRequest } = await returns.createReturn({ pharmacyId: pharmacy._id, orderId: String(source._id),
      items: [{ orderItemId: String(line._id), quantity, reasonType: 'wrong_item' }] });
    const before = await Account.findOne().lean();
    const result = await warehouseReturns.approveReturn(returnRequest._id, warehouse._id, owner._id);
    const grant = await ReturnCredit.findById(result.returnRequest.creditGrantId).lean();
    assert.equal(grant.compensationClawbackSyp, quantity * 10000);
    assert.equal(grant.amountSyp, quantity * 90000);
    assert.equal((await Account.findById(before._id)).balanceCache.syp, before.balanceCache.syp);
    const report = await settlementReport.getSettlementForWarehouse(warehouse._id);
    const row = report.rows.find(row => String(row.orderId) === String(source._id));
    assert.equal(row.compensationClawbackSyp, grant.compensationClawbackSyp);
    assert.equal(row.creditedSyp, grant.amountSyp);
    assert.equal(row.netCompensationSyp, 50000 - grant.compensationClawbackSyp);
    const later = await settlementReport.getSettlementForWarehouse(warehouse._id, {
      from: new Date(grant.issuedAt.getTime() + 1000).toISOString(), to: new Date(grant.issuedAt.getTime() + 60000).toISOString() });
    assert.equal(later.totals.compensationClawbackSyp, 0);
  }
  const totalGrants = await ReturnCredit.find().lean();
  const final = await settlementReport.getSettlementForWarehouse(warehouse._id);
  assert.equal(final.totals.compensationClawbackSyp, totalGrants.reduce((n, grant) => n + grant.compensationClawbackSyp, 0));
});

test('admin settlement candidates contain only posted, approved, unrecognized post-cutover receipts in the actual period', async () => {
  await deliver(await order());
  const old = await payment(100);
  const oldReview = await approve(old);
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  await deliver(await order());
  const receipt = await payment(5000), accepted = await approve(receipt);
  await payment(6000); // no proof: not a candidate
  const reversed = await payment(7000); await approve(reversed);
  await payments.reversePayment(reversed._id, warehouse._id, accountant._id, { reason: 'Synthetic reversal', idempotencyKey: key() });
  const before = await Payment.countDocuments(), events = await Event.countDocuments();
  const response = await call(admin, 'GET', `/admin/collection-accounting/warehouses/${warehouse._id}?period=custom&from=2026-11-01&to=2026-11-07`);
  assert.equal(response.status, 200);
  const rows = response.body.settlementCandidates.rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].id, String(accepted._id));
  assert.equal(rows[0].amountSyp, 5000); assert.equal(rows[0].paymentId, String(receipt._id));
  assert.equal(rows[0].pharmacy.nameEn, pharmacy.nameEn);
  assert.ok(!rows.some(row => row.id === String(oldReview._id)));
  assert.equal(await Payment.countDocuments(), before); assert.equal(await Event.countDocuments(), events);
  const ownerRead = await call(owner, 'GET', '/warehouse/collection-accounting');
  assert.equal(ownerRead.body.settlementCandidates, undefined);
  const future = await call(admin, 'GET', `/admin/collection-accounting/warehouses/${warehouse._id}?period=custom&from=2026-12-01&to=2026-12-07`);
  assert.deepEqual(future.body.settlementCandidates.rows, []);
  const foreignWarehouse = new mongoose.Types.ObjectId();
  const foreign = await call(admin, 'GET', `/admin/collection-accounting/warehouses/${foreignWarehouse}`);
  assert.equal(foreign.status, 404);
  await settlements.confirmWarehouseSettlement(admin._id, warehouse._id, settlementBody([accepted]));
  const after = await call(admin, 'GET', `/admin/collection-accounting/warehouses/${warehouse._id}`);
  assert.deepEqual(after.body.settlementCandidates.rows, []);
});

test('candidate pagination is bounded and tenant-scoped, and never returns the same proof twice', async () => {
  await contracts.createAndActivate(admin._id, warehouse._id, contractBody());
  await deliver(await order());
  const reviewIds = new Set();
  for (let i = 0; i < 21; i++) reviewIds.add(String((await approve(await payment(10)))._id));
  const path = `/admin/collection-accounting/warehouses/${warehouse._id}`;
  const first = await call(admin, 'GET', path);
  assert.equal(first.status, 200); assert.equal(first.body.settlementCandidates.rows.length, 20);
  assert.equal(first.body.settlementCandidates.hasMore, true);
  const second = await call(admin, 'GET', `${path}?candidateAfter=${first.body.settlementCandidates.nextCursor}`);
  assert.equal(second.status, 200); assert.equal(second.body.settlementCandidates.rows.length, 1);
  assert.equal(second.body.settlementCandidates.hasMore, false);
  const got = [...first.body.settlementCandidates.rows, ...second.body.settlementCandidates.rows].map(row => row.id);
  assert.equal(new Set(got).size, 21); assert.deepEqual(new Set(got), reviewIds);
  const denied = await call(accountant, 'GET', `/warehouse/collection-accounting?candidateAfter=${got[0]}`);
  assert.equal(denied.status, 403);
});
