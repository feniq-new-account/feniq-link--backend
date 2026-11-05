process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'distribution-trip-test-secret-at-least-32-characters';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Trip = require('../src/models/distributionTrip.model');
const Event = require('../src/models/distributionTripEvent.model');

let server, baseUrl, adminToken, pharmacyToken, first, second;
async function request(method, path, { token, body } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
function token(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret);
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-distribution-trips' });
  const admin = await User.create({
    name: 'Admin', phone: '0931000011', role: 'admin', status: 'active',
  });
  const pharmacist = await User.create({
    name: 'Pharmacist', phone: '0931000012', role: 'pharmacy', status: 'active',
  });
  adminToken = token(admin);
  pharmacyToken = token(pharmacist);
  first = await Pharmacy.create({
    userId: pharmacist._id, nameAr: 'صيدلية أولى', nameEn: 'First',
    ownerName: 'Owner', phone: '0931000012',
    address: 'Kasab street', city: 'Latakia', areaType: 'rural', addedBy: 'self',
  });
  const secondUser = await User.create({
    name: 'Pharmacist 2', phone: '0931000013', role: 'pharmacy', status: 'active',
  });
  second = await Pharmacy.create({
    userId: secondUser._id, nameAr: 'صيدلية ثانية', nameEn: 'Second',
    ownerName: 'Owner 2', phone: '0931000013',
    address: 'Other street', city: 'Latakia', areaType: 'rural', addedBy: 'self',
  });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api';
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});

test('trip management is admin-only, never a pharmacy API', async () => {
  assert.equal((await request('GET', '/admin/distribution/trips')).status, 401);
  assert.equal((await request('GET', '/admin/distribution/trips',
    { token: pharmacyToken })).status, 403);
  assert.equal((await request('POST', '/admin/distribution/trips', {
    token: pharmacyToken, body: { region: 'Kasab' },
  })).status, 403);
});

test('creating a trip validates date, identity, unique stops and order', async () => {
  const input = {
    region: 'Kasab', serviceDate: '2026-11-06',
    driverName: 'Driver 1', driverPhone: '0931000014',
    pharmacyIds: [String(second._id), String(first._id)],
  };
  assert.equal((await request('POST', '/admin/distribution/trips',
    { token: adminToken, body: { ...input, serviceDate: '2026-02-30' } })).status, 400);
  assert.equal((await request('POST', '/admin/distribution/trips',
    { token: adminToken, body: { ...input, pharmacyIds: [String(first._id), String(first._id)] } })).status, 400);
  assert.equal((await request('POST', '/admin/distribution/trips',
    { token: adminToken, body: { ...input, pharmacyIds: [] } })).status, 400);

  const result = await request('POST', '/admin/distribution/trips',
    { token: adminToken, body: input });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const trip = result.body.trip;
  assert.equal(trip.region, 'Kasab');
  assert.equal(trip.status, 'planned');
  assert.equal(trip.revision, 0);
  assert.deepEqual(trip.stops.map(s => s.pharmacyId),
    [String(second._id), String(first._id)]);
  assert.equal(trip.stops[0].pharmacyName, 'صيدلية ثانية');
  assert.equal(Object.hasOwn(trip, 'totalPrice'), false);
});

test('trip state machine requires all stops and optimistic revisions', async () => {
  const initial = await Trip.findOne({ region: 'Kasab' }).lean();
  const path = '/admin/distribution/trips/' + initial._id;
  assert.equal((await request('POST', path + '/complete',
    { token: adminToken, body: { revision: 0 } })).status, 400);
  const start = await request('POST', path + '/start',
    { token: adminToken, body: { revision: 0 } });
  assert.equal(start.status, 200);
  assert.equal(start.body.trip.revision, 1);
  assert.equal(start.body.trip.status, 'in_progress');
  assert.equal((await request('POST', path + '/start',
    { token: adminToken, body: { revision: 0 } })).status, 409);

  const stopPath1 = path + '/stops/' + start.body.trip.stops[0]._id;
  const stopPath2 = path + '/stops/' + start.body.trip.stops[1]._id;
  assert.equal((await request('PATCH', stopPath1,
    { token: adminToken, body: { revision: 1, status: 'failed' } })).status, 400);
  const delivered = await request('PATCH', stopPath1,
    { token: adminToken, body: { revision: 1, status: 'delivered' } });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.trip.revision, 2);
  assert.equal((await request('POST', path + '/complete',
    { token: adminToken, body: { revision: 2 } })).status, 400);
  const failed = await request('PATCH', stopPath2,
    { token: adminToken, body: { revision: 2, status: 'failed', note: 'Pharmacy closed' } });
  assert.equal(failed.status, 200);
  assert.equal(failed.body.trip.revision, 3);
  const end = await request('POST', path + '/complete',
    { token: adminToken, body: { revision: 3 } });
  assert.equal(end.status, 200);
  assert.equal(end.body.trip.status, 'completed');
  assert.equal(end.body.trip.revision, 4);
  assert.equal((await request('POST', path + '/cancel',
    { token: adminToken, body: { revision: 4, reason: 'Too late' } })).status, 400);

  assert.equal(await Event.countDocuments({ tripId: initial._id }), 5);
  const list = await request('GET', '/admin/distribution/trips?status=completed',
    { token: adminToken });
  assert.equal(list.status, 200);
  assert.equal(list.body.trips.length, 1);
});

test('cancelling a trip needs a reason and preserves the audit trail', async () => {
  const created = await request('POST', '/admin/distribution/trips', {
    token: adminToken,
    body: {
      region: 'Slenfeh', serviceDate: '2026-11-07',
      driverName: 'Driver 2', pharmacyIds: [String(first._id)],
    },
  });
  assert.equal(created.status, 201);
  const path = '/admin/distribution/trips/' + created.body.trip._id + '/cancel';
  assert.equal((await request('POST', path,
    { token: adminToken, body: { revision: 0 } })).status, 400);
  const cancelled = await request('POST', path, {
    token: adminToken, body: { revision: 0, reason: 'Driver unavailable' },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.trip.status, 'cancelled');
  assert.equal(await Event.countDocuments({ tripId: created.body.trip._id }), 2);
});
