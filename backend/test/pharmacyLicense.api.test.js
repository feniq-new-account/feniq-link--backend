process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-pharmacy-licence-workflow';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Audit = require('../src/models/pharmacyLicenseAudit.model');
const env = require('../src/config/env');

let server;
let baseUrl;
let admin, owner, pending, other, pharmacy;
let adminToken, ownerToken, pendingToken, otherToken;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3]);

function tokenFor(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: '1h' });
}
async function request(method, path, { token, form, body } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, payload, headers: response.headers };
}
function formOf(buffer = png, mime = 'image/png') {
  const form = new FormData();
  form.append('document', new Blob([buffer], { type: mime }), 'licence.png');
  return form;
}
async function makePharmacy(phone, status) {
  const user = await User.create({ role: 'pharmacy', status, name: phone, phone,
    pharmacyApprovedAt: status === 'active' ? new Date('2026-11-05T09:00:00.000Z') : null });
  const row = await Pharmacy.create({
    userId: user._id, nameAr: 'صيدلية تجريبية', nameEn: 'Pharmacy',
    ownerName: 'Owner', phone, city: 'Latakia',
    address: 'Some street', areaType: 'city', addedBy: 'self',
  });
  return { user, row };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-pharmacy-private-licence' });
  admin = await User.create({ role: 'admin', status: 'active', name: 'Admin', phone: '0931000001' });
  ({ user: owner, row: pharmacy } = await makePharmacy('0931000002', 'active'));
  ({ user: pending } = await makePharmacy('0931000003', 'pending'));
  ({ user: other } = await makePharmacy('0931000004', 'active'));
  adminToken = tokenFor(admin); ownerToken = tokenFor(owner);
  pendingToken = tokenFor(pending); otherToken = tokenFor(other);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api';
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});

test('licence status is private and the grace starts at actual approval', async () => {
  assert.equal((await request('GET', '/pharmacy/license')).status, 401);
  assert.equal((await request('GET', '/pharmacy/license', { token: adminToken })).status, 403);
  assert.equal((await request('GET', '/pharmacy/license', { token: pendingToken })).status, 403);
  const response = await request('GET', '/pharmacy/license', { token: ownerToken });
  assert.equal(response.status, 200);
  assert.equal(response.payload.license.status, 'not_submitted');
  assert.equal(response.payload.license.dueAt, '2026-11-19T09:00:00.000Z');
  assert.equal(response.payload.license.graceExpired, false);
  assert.equal(Object.hasOwn(response.payload.license, 'documentId'), false);
});

test('licence upload rejects malformed files and enforces owner-only access', async () => {
  assert.equal((await request('POST', '/pharmacy/license', { token: ownerToken, form: formOf(Buffer.from('fake')) })).status, 400);
  assert.equal((await request('POST', '/pharmacy/license', { token: pendingToken, form: formOf() })).status, 403);
  assert.equal((await request('POST', '/pharmacy/license', { token: adminToken, form: formOf() })).status, 403);
  assert.equal((await request('GET', '/pharmacy/license/document', { token: otherToken })).status, 404);
  const submit = await request('POST', '/pharmacy/license', { token: ownerToken, form: formOf() });
  assert.equal(submit.status, 201, JSON.stringify(submit.payload));
  assert.equal(submit.payload.license.status, 'pending');
  assert.equal(submit.payload.license.revision, 1);
  assert.equal(Object.hasOwn(submit.payload.license, 'documentId'), false);
  const doc = await request('GET', '/pharmacy/license/document', { token: ownerToken });
  assert.equal(doc.status, 200);
  assert.deepEqual(doc.payload, png);
  assert.match(doc.headers.get('content-disposition'), /attachment/);
  assert.match(doc.headers.get('cache-control'), /no-store/);
  assert.equal((await request('GET', '/admin/pharmacy-licenses', { token: ownerToken })).status, 403);
});

test('admin review requires a reason for rejection, supports resubmission and approval', async () => {
  const queue = await request('GET', '/admin/pharmacy-licenses', { token: adminToken });
  assert.equal(queue.status, 200);
  assert.equal(queue.payload.items.length, 1);
  assert.equal(queue.payload.items[0].status, 'pending');
  assert.equal(Object.hasOwn(queue.payload.items[0], 'documentId'), false);
  const id = String(pharmacy._id);

  const adminDocument = await request('GET', '/admin/pharmacy-licenses/' + id + '/document', { token: adminToken });
  assert.equal(adminDocument.status, 200);
  assert.deepEqual(adminDocument.payload, png);
  assert.equal((await request('GET', '/admin/pharmacy-licenses/' + id + '/document', { token: otherToken })).status, 403);

  const rejectMissingReason = await request('POST', '/admin/pharmacy-licenses/' + id + '/review',
    { token: adminToken, body: { decision: 'rejected' } });
  assert.equal(rejectMissingReason.status, 400);
  const rejected = await request('POST', '/admin/pharmacy-licenses/' + id + '/review',
    { token: adminToken, body: { decision: 'rejected', note: 'Photo is unreadable' } });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.payload));
  assert.equal(rejected.payload.license.status, 'rejected');
  assert.equal(rejected.payload.license.reviewNote, 'Photo is unreadable');
  const resubmit = await request('POST', '/pharmacy/license', { token: ownerToken, form: formOf() });
  assert.equal(resubmit.status, 201, JSON.stringify(resubmit.payload));
  assert.equal(resubmit.payload.license.revision, 2);

  const approved = await request('POST', '/admin/pharmacy-licenses/' + id + '/review',
    { token: adminToken, body: { decision: 'approved' } });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));
  assert.equal(approved.payload.license.status, 'approved');
  assert.equal(approved.payload.license.graceExpired, false);
  assert.equal((await request('POST', '/pharmacy/license', { token: ownerToken, form: formOf() })).status, 409);
  assert.equal((await request('POST', '/admin/pharmacy-licenses/' + id + '/review',
    { token: adminToken, body: { decision: 'approved' } })).status, 409);
  assert.equal(await Audit.countDocuments({ pharmacyId: pharmacy._id }), 4);
});

test('auth responses never expose document reference, and legacy approval has unknown deadline', async () => {
  const me = await request('GET', '/auth/me', { token: ownerToken });
  assert.equal(me.status, 200);
  assert.equal(Object.hasOwn(me.payload.pharmacy, 'licenseReview'), false);
  assert.equal(Object.hasOwn(me.payload.pharmacy, 'licenseImage'), false);
  const legacy = await makePharmacy('0931000005', 'active');
  await User.updateOne({ _id: legacy.user._id }, { $unset: { pharmacyApprovedAt: '' } });
  const status = await request('GET', '/pharmacy/license', { token: tokenFor(legacy.user) });
  assert.equal(status.status, 200);
  assert.equal(status.payload.license.dueAt, null);
});
