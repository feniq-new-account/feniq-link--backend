process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'synthetic-proof-accounting-test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Pharmacy = require('../src/models/pharmacy.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const Payment = require('../src/models/payment.model');
const LedgerAccount = require('../src/models/ledgerAccount.model');
const LedgerEntry = require('../src/models/ledgerEntry.model');
const Proof = require('../src/models/paymentProof.model');
const Review = require('../src/models/paymentProofReview.model');
const Audit = require('../src/models/financialAuditLog.model');
const ledger = require('../src/services/ledger.service');
const payments = require('../src/services/payment.service');
const proofs = require('../src/services/paymentProof.service');
const audit = require('../src/services/financialAudit.service');
const { runInTransaction } = require('../src/utils/transaction');
const { rolePermissions } = require('../src/utils/rolePermissions');
let server, base;
const users = {}, tokens = {};
let warehouse, foreignWarehouse, pharmacy, account;
let number = 0;
const key = prefix => `${prefix}-${++number}`;

test.before(async () => {
  await startMemoryMongo({ dbName: 'payment-proof-isolated', orderingOpen: false });
  await syncIndexes(User, Warehouse, Pharmacy, Payment, LedgerAccount, LedgerEntry, Proof, Review);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: 10000, source: 'manual' });
  for (const [name, role, warehouseRole] of [
    ['owner', 'warehouse', 'owner'], ['accountant', 'warehouse', 'accountant'],
    ['foreign', 'warehouse', 'accountant'], ['legacy', 'warehouse', null],
    ['admin', 'admin', null], ['rep', 'rep', null], ['pharmacy', 'pharmacy', null],
  ]) {
    users[name] = await User.create({ name: `Synthetic ${name}`, role, warehouseRole,
      phone: `0997000${String(++number).padStart(3, '0')}`, status: 'active' });
    tokens[name] = jwt.sign({ sub: String(users[name]._id) }, env.jwtSecret, { expiresIn: '1h' });
  }
  warehouse = await Warehouse.create({ userId: users.owner._id,
    memberUserIds: [users.accountant._id, users.legacy._id],
    nameAr: 'اختبار', nameEn: 'Synthetic', phone: '0997000111', address: 'Test', city: 'Test', deliveryType: 'self' });
  foreignWarehouse = await Warehouse.create({ userId: users.foreign._id,
    nameAr: 'اختبار آخر', nameEn: 'Other synthetic', phone: '0997000222', address: 'Test', city: 'Test', deliveryType: 'self' });
  pharmacy = await Pharmacy.create({ userId: users.pharmacy._id, nameAr: 'صيدلية اختبار', nameEn: 'Synthetic pharmacy',
    ownerName: 'Synthetic', phone: '0997000333', address: 'Test', city: 'Test', areaType: 'city', addedBy: 'self' });
  account = await ledger.resolveAccount(pharmacy._id, warehouse._id);
  await runInTransaction(session => ledger.postEntry({ account, kind: 'charge', amountSyp: 1000000,
    amountUsd: 100, source: { orderId: new mongoose.Types.ObjectId() }, createdBy: users.accountant._id,
  }, session));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/warehouse/payments`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});
async function payment(extra = {}) {
  return payments.createPayment(warehouse._id, users.accountant._id, {
    pharmacyId: String(pharmacy._id), amount: 10000, currency: 'SYP',
    paidAt: '2026-11-01T10:00:00Z', idempotencyKey: key('payment'), ...extra,
  });
}
function submission(extra = {}) { return { proofReference: 'synthetic-proof-no-external-fetch', idempotencyKey: key('proof'), ...extra }; }
function decision(extra = {}) { return { decision: 'approved', idempotencyKey: key('review'), ...extra }; }
async function call(method, path, body, role = 'accountant') {
  const response = await fetch(base + path, { method, headers: {
    'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
async function financialState() {
  const row = await LedgerAccount.findById(account._id).lean();
  return { payments: await Payment.countDocuments(), entries: await LedgerEntry.countDocuments(),
    seq: row.seqCounter, cache: row.balanceCache };
}

test('warehouse accountant submits and approves actual evidence once without another payment or debt credit', async () => {
  const receipt = await payment();
  const before = await financialState();
  const submitted = await call('POST', `/${receipt._id}/proofs`, submission());
  assert.equal(submitted.status, 201); assert.equal(submitted.body.financialPosting, false);
  const proof = submitted.body.proof;
  assert.equal(proof.amountSyp, 10000); assert.equal(proof.paidAt, '2026-11-01T10:00:00.000Z');
  assert.equal(proof.fx.rate, 10000); assert.equal(proof.collector, 'warehouse');
  const reviewed = await call('POST', `/${receipt._id}/proofs/${proof.id}/review`, decision());
  assert.equal(reviewed.status, 201);
  const history = await call('GET', `/${receipt._id}/proofs`);
  assert.equal(history.status, 200); assert.equal(history.headers.get('cache-control'), 'no-store');
  assert.equal(history.body.rows[0].effectiveApproval, true);
  assert.equal(history.body.rows[0].review.decision, 'approved');
  assert.equal(history.body.rows[0].fingerprint, undefined);
  assert.deepEqual(await financialState(), before);
  assert.equal((await ledger.verifyAccount(account._id)).ok, true);
  assert.equal(await Audit.countDocuments({ entityId: proof.id, action: 'payment.proof_submitted' }), 1);
});
test('retries after commit and concurrent requests return original evidence/decision with one audit event', async () => {
  const receipt = await payment();
  const body = submission();
  const results = await Promise.all([1, 2, 3].map(() => call('POST', `/${receipt._id}/proofs`, body)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 201]);
  assert.equal(new Set(results.map(r => r.body.proof.id)).size, 1);
  assert.equal(results.filter(r => r.headers.get('idempotent-replay') === 'true').length, 2);
  const sameCanonicalId = await call('POST', `/${String(receipt._id).toUpperCase()}/proofs`, body);
  assert.equal(sameCanonicalId.status, 200);
  const proofId = results[0].body.proof.id;
  const approval = decision();
  const decisions = await Promise.all([1, 2, 3].map(() => call('POST', `/${receipt._id}/proofs/${proofId}/review`, approval)));
  assert.deepEqual(decisions.map(r => r.status).sort(), [200, 200, 201]);
  assert.equal(await Proof.countDocuments({ paymentId: receipt._id }), 1);
  assert.equal(await Review.countDocuments({ proofId }), 1);
  assert.equal(await Audit.countDocuments({ action: 'payment.proof_approved', entityId: decisions[0].body.review.id }), 1);
  const conflict = await call('POST', `/${receipt._id}/proofs`, { ...body, proofReference: 'changed' });
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'IDEMPOTENCY_KEY_REUSED');
});
test('owner/legacy/admin/rep/pharmacy do not gain proof review permissions; tenant scope is server-owned', async () => {
  const receipt = await payment();
  const submitted = await proofs.submit(users.accountant._id, receipt._id, submission());
  for (const role of ['owner', 'legacy', 'admin', 'rep', 'pharmacy']) {
    assert.equal(rolePermissions(users[role]).paymentProofReview, false);
    assert.equal((await call('POST', `/${receipt._id}/proofs/${submitted.record._id}/review`, decision(), role)).status, 403);
  }
  assert.equal((await call('GET', `/${receipt._id}/proofs`, undefined, 'foreign')).status, 404);
  assert.equal((await call('POST', `/${receipt._id}/proofs`, submission(), 'foreign')).status, 404);
  assert.equal((await call('POST', `/${receipt._id}/proofs/${submitted.record._id}/review`, decision(), 'foreign')).status, 404);
  assert.equal((await call('POST', `/${receipt._id}/proofs`, submission(), 'owner')).status, 403);
  assert.equal((await call('GET', `/${receipt._id}/proofs`, undefined, 'owner')).status, 200);
  assert.equal((await call('GET', `/${receipt._id}/proofs`, undefined, null)).status, 401);
  await assert.rejects(proofs.review(users.admin._id, receipt._id, submitted.record._id, decision()), { statusCode: 403 });
});
test('rejection requires a reason, revised evidence appends history and old decisions cannot change', async () => {
  const receipt = await payment();
  const first = await proofs.submit(users.accountant._id, receipt._id, submission());
  await assert.rejects(proofs.review(users.accountant._id, receipt._id, first.record._id, decision({ decision: 'rejected' })), { code: 'INVALID_PAYMENT_PROOF' });
  const rejected = await proofs.review(users.accountant._id, receipt._id, first.record._id,
    decision({ decision: 'rejected', reason: 'Synthetic missing reference' }));
  await assert.rejects(proofs.review(users.accountant._id, receipt._id, first.record._id, decision()), { code: 'PAYMENT_PROOF_ALREADY_REVIEWED' });
  const second = await proofs.submit(users.accountant._id, receipt._id, submission({ proofReference: 'corrected-synthetic-reference' }));
  assert.equal(first.record.revision, 1); assert.equal(second.record.revision, 2);
  assert.equal((await Review.findById(rejected.record._id)).decision, 'rejected');
  await proofs.review(users.accountant._id, receipt._id, second.record._id, decision());
  await assert.rejects(proofs.submit(users.accountant._id, receipt._id, submission()), { code: 'PAYMENT_PROOF_EXISTS' });
  const history = await proofs.list(users.owner._id, receipt._id, { before: 2 });
  assert.equal(history.rows.length, 1); assert.equal(history.rows[0].revision, 1);
  assert.equal(history.rows[0].effectiveApproval, false);
});
test('approval and payment reversal serialize; reversal makes a prior approval ineffective without rewriting it', async () => {
  const receipt = await payment();
  const submitted = await proofs.submit(users.accountant._id, receipt._id, submission());
  const outcomes = await Promise.allSettled([
    proofs.review(users.accountant._id, receipt._id, submitted.record._id, decision()),
    payments.reversePayment(receipt._id, warehouse._id, users.accountant._id,
      { reason: 'Synthetic correction', idempotencyKey: key('reverse') }),
  ]);
  assert.equal(outcomes[1].status, 'fulfilled');
  if (outcomes[0].status === 'rejected') assert.equal(outcomes[0].reason.code, 'PAYMENT_REVERSED');
  const history = await proofs.list(users.accountant._id, receipt._id);
  assert.equal(history.paymentStatus, 'reversed'); assert.equal(history.rows[0].effectiveApproval, false);
  await assert.rejects(proofs.review(users.accountant._id, receipt._id, submitted.record._id, decision()), { code: 'PAYMENT_REVERSED' });
  assert.equal((await ledger.verifyAccount(account._id)).ok, true);
});
test('failed audit rolls back the decision and account lock without changing money', async () => {
  const receipt = await payment();
  const submitted = await proofs.submit(users.accountant._id, receipt._id, submission());
  const before = await LedgerAccount.findById(account._id).lean();
  const original = audit.record;
  try {
    audit.record = async (event, session) => {
      if (event.action === 'payment.proof_approved') throw new Error('Synthetic audit failure');
      return original(event, session);
    };
    await assert.rejects(proofs.review(users.accountant._id, receipt._id, submitted.record._id, decision()), /Synthetic audit failure/);
  } finally { audit.record = original; }
  assert.equal(await Review.countDocuments({ proofId: submitted.record._id }), 0);
  const after = await LedgerAccount.findById(account._id).lean();
  assert.equal(after.financialRevision, before.financialRevision); assert.equal(after.seqCounter, before.seqCounter);
  assert.deepEqual(after.balanceCache, before.balanceCache);
});
test('client cannot change collector, paidAt, amounts, tenant or approval in a proof request', async () => {
  const receipt = await payment();
  for (const extra of [{ collector: 'feniq' }, { paidAt: '2026-11-06T10:00:00Z' }, { amountSyp: 1 },
    { warehouseId: String(foreignWarehouse._id) }, { approved: true }, { idempotencyKey: '' }]) {
    assert.equal((await call('POST', `/${receipt._id}/proofs`, submission(extra))).status, 400);
  }
  assert.equal(await Proof.countDocuments({ paymentId: receipt._id }), 0);
  assert.equal((await call('GET', `/${receipt._id}/proofs?before=0`)).status, 400);
  assert.equal((await call('GET', `/${receipt._id}/proofs?warehouseId=${foreignWarehouse._id}`)).status, 400);
  await assert.rejects(ledger.lockAccountForFinancialChange(account._id, warehouse._id), /requires a transaction/);
});
test('frozen proof FX and actual cash time survive rate changes and later review', async () => {
  const receipt = await payment({ currency: 'USD', amount: 1 });
  await ExchangeRate.updateOne({ _id: 'singleton' }, { $set: { usdToSyp: 20000 } });
  const submitted = await proofs.submit(users.accountant._id, receipt._id, submission());
  const approved = await proofs.review(users.accountant._id, receipt._id, submitted.record._id, decision());
  assert.equal(submitted.record.amountSyp, 10000); assert.equal(submitted.record.fx.rate, 10000);
  assert.equal(submitted.record.paidAt.toISOString(), '2026-11-01T10:00:00.000Z');
  assert.ok(approved.record.at > submitted.record.paidAt);
});
test('competing approval/rejection keys produce one immutable decision and one conflict', async () => {
  const receipt = await payment();
  const submitted = await proofs.submit(users.accountant._id, receipt._id, submission());
  const outcomes = await Promise.allSettled([
    proofs.review(users.accountant._id, receipt._id, submitted.record._id, decision()),
    proofs.review(users.accountant._id, receipt._id, submitted.record._id,
      decision({ decision: 'rejected', reason: 'Synthetic disputed proof' })),
  ]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(r => r.status === 'rejected').reason.code, 'PAYMENT_PROOF_ALREADY_REVIEWED');
  assert.equal(await Review.countDocuments({ proofId: submitted.record._id }), 1);
});
test('a payment lacking its matching ledger source cannot acquire authoritative evidence', async () => {
  // A malformed synthetic record, created directly instead of the production
  // payment writer, proves that an amount on a Payment row is not enough.
  const [bad] = await Payment.create([{
    warehouseId: warehouse._id, pharmacyId: pharmacy._id, accountId: account._id,
    ledgerEntryId: new mongoose.Types.ObjectId(), recordedBy: users.accountant._id,
    amount: 1000, amountSyp: 1000, currency: 'SYP', kind: 'settlement', status: 'posted',
    idempotencyKey: key('malformed'), paidAt: new Date('2026-11-01T10:00:00Z'),
  }]);
  const before = await LedgerAccount.findById(account._id).lean();
  await assert.rejects(proofs.submit(users.accountant._id, bad._id, submission()), { code: 'PAYMENT_PROOF_SOURCE_UNVERIFIED' });
  assert.equal(await Proof.countDocuments({ paymentId: bad._id }), 0);
  assert.equal((await LedgerAccount.findById(account._id)).financialRevision, before.financialRevision);
});
