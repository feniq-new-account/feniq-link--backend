process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'synthetic-collection-accounting-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const { POLICY_VERSION } = require('../src/utils/collectionAccountingPolicy');
const terms = { invoiceSyp: 100000, originalCommissionSyp: 10000, areaType: 'city', contractRef: 'synthetic-only' };
let server, baseUrl;
const tokens = {};

test.before(async () => {
  await startMemoryMongo({ dbName: 'collection-accounting-endpoints', orderingOpen: false });
  const users = await User.create(['admin', 'warehouse', 'pharmacy', 'rep'].map((role, index) => ({
    name: `Synthetic ${role}`, phone: `099800010${index}`, role, status: 'active',
  })));
  for (const user of users) tokens[user.role] = jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: '1h' });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/commission-policy-preview/accounting`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});
async function call(body, token = tokens.admin) {
  const response = await fetch(baseUrl, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function financialCounts() {
  const result = {};
  for (const name of ['orders', 'orderitems', 'payments', 'ledgeraccounts', 'ledgerentries',
    'commissioncollections', 'financialauditlogs', 'returns']) {
    result[name] = await mongoose.connection.db.collection(name).countDocuments();
  }
  return result;
}
test('admin can calculate confirmed rules with no financial persistence or cached response', async () => {
  const before = await financialCounts();
  const response = await call({
    collection: { terms, previousCollectedSyp: 0, collectedSyp: 50000 },
    fifo: { accountId: 'synthetic-account', paymentSyp: 50000, invoices: [
      { accountId: 'synthetic-account', invoiceId: 'first', deliveredAt: '2026-11-01T12:00:00Z', outstandingSyp: 30000, engine: 'legacy' },
      { accountId: 'synthetic-account', invoiceId: 'second', deliveredAt: '2026-11-02T12:00:00Z', outstandingSyp: 40000, engine: POLICY_VERSION },
    ] },
    return: { terms, collectedSyp: 100000, previousReturnedCommissionSyp: 0,
      returnedCommissionSyp: 2000, settlementId: 'original-settlement' },
    remittance: { collector: 'feniq', paidAt: '2026-11-06T10:00:00Z' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.policyVersion, POLICY_VERSION);
  assert.equal(response.body.previewOnly, true); assert.equal(response.body.persisted, false);
  assert.equal(response.body.collection.increment.feniqSyp, 2500);
  assert.equal(response.body.fifo.allocations[0].invoiceId, 'first');
  assert.equal(response.body.fifo.allocations[1].amountSyp, 20000);
  assert.equal(response.body.return.correction.originalCommissionSyp, -2000);
  assert.equal(response.body.return.treatment, 'offset_next_settlement');
  assert.equal(response.body.remittance.dueAt, '2026-11-08T10:00:00.000Z');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await financialCounts(), before);
});
test('unauthenticated and non-admin users cannot use the internal calculation endpoint', async () => {
  const body = { remittance: { collector: 'warehouse', paidAt: '2026-11-06T10:00:00Z' } };
  assert.equal((await call(body, null)).status, 401);
  for (const role of ['warehouse', 'pharmacy', 'rep']) assert.equal((await call(body, tokens[role])).status, 403);
});
test('partial collection/return and foreign-account allocation fail without a write', async () => {
  const before = await financialCounts();
  const partial = await call({ return: { terms, collectedSyp: 50000,
    previousReturnedCommissionSyp: 0, returnedCommissionSyp: 2000 } });
  assert.equal(partial.status, 409); assert.equal(partial.body.code, 'PARTIAL_RETURN_REVIEW_REQUIRED');
  const foreign = await call({ fifo: { accountId: 'own', paymentSyp: 10, invoices: [
    { accountId: 'foreign', invoiceId: 'x', deliveredAt: '2026-11-01T12:00:00Z', outstandingSyp: 10, engine: POLICY_VERSION },
  ] } });
  assert.equal(foreign.status, 400);
  assert.deepEqual(await financialCounts(), before);
});
test('request booleans cannot approve proof or activate financial posting', async () => {
  const before = await financialCounts();
  for (const body of [{}, { approved: true }, { activate: true }, { toString: {} },
    { collection: { terms, previousCollectedSyp: 0, collectedSyp: 100000, approved: true } },
    { remittance: { collector: 'feniq', paidAt: '2026-11-06T10:00:00Z', approvedAt: '2026-11-07T10:00:00Z' } },
  ]) assert.equal((await call(body)).status, 400);
  assert.deepEqual(await financialCounts(), before);
});
