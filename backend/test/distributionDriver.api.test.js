process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'driver-trip-test-secret-longer-than-32-chars';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Rep = require('../src/models/rep.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Trip = require('../src/models/distributionTrip.model');
const Event = require('../src/models/distributionTripEvent.model');

let server, url, admin, repA, repB, inactiveRep, pharmacy, adminToken, repAToken, repBToken, inactiveToken;
const token = user => jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret);
async function call(method, path, { bearer, body } = {}) {
  const response = await fetch(url + path, {
    method,
    headers: { ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-driver-access-test' });
  admin = await User.create({ name: 'Admin', phone: '0931400001', status: 'active', role: 'admin' });
  repA = await User.create({ name: 'Driver A', phone: '0931400002', status: 'active', role: 'rep' });
  repB = await User.create({ name: 'Driver B', phone: '0931400003', status: 'active', role: 'rep' });
  inactiveRep = await User.create({ name: 'Inactive', phone: '0931400004', status: 'active', role: 'rep' });
  const warehouseId = new mongoose.Types.ObjectId();
  await Rep.create([
    { userId: repA._id, warehouseId, name: 'Driver A', phone: repA.phone, isActive: true },
    { userId: repB._id, warehouseId, name: 'Driver B', phone: repB.phone, isActive: true },
    { userId: inactiveRep._id, warehouseId, name: 'Inactive', phone: inactiveRep.phone, isActive: false },
  ]);
  const owner = await User.create({ name: 'Pharmacist', phone: '0931400005', status: 'active', role: 'pharmacy' });
  pharmacy = await Pharmacy.create({
    userId: owner._id, nameAr: 'صيدلية تجريبية', nameEn: 'Pharmacy', ownerName: 'Owner',
    address: 'Somewhere', city: 'Latakia', areaType: 'rural', phone: owner.phone, addedBy: 'self',
  });
  adminToken = token(admin);
  repAToken = token(repA);
  repBToken = token(repB);
  inactiveToken = token(inactiveRep);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port + '/api';
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});

test('trip cannot assign unapproved or inactive rep identities', async () => {
  const make = driverUserId => call('POST', '/admin/distribution/trips', {
    bearer: adminToken,
    body: { region: 'Kasab', driverName: 'Assigned Driver', serviceDate: '2026-11-06',
      pharmacyIds: [String(pharmacy._id)], driverUserId },
  });
  assert.equal((await make(String(inactiveRep._id))).status, 400);
  const created = await make(String(repA._id));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.trip.driverUserId, String(repA._id));
  assert.equal((await call('GET', '/driver/distribution/trips', { bearer: inactiveToken })).status, 403);
});

test('driver sees only own trips and cannot bypass an admin-only endpoint', async () => {
  const [trip] = await Trip.find({ driverUserId: repA._id }).lean();
  assert.ok(trip);
  assert.equal((await call('GET', '/driver/distribution/trips')).status, 401);
  assert.equal((await call('GET', '/driver/distribution/trips', { bearer: repBToken })).body.trips.length, 0);
  const own = await call('GET', '/driver/distribution/trips', { bearer: repAToken });
  assert.equal(own.status, 200);
  assert.equal(own.body.trips.length, 1);
  assert.equal((await call('GET', '/driver/distribution/trips/' + trip._id, { bearer: repBToken })).status, 404);
  assert.equal((await call('POST', '/admin/distribution/trips/' + trip._id + '/start',
    { bearer: repAToken, body: { revision: 0 } })).status, 403);
  assert.equal((await call('POST', '/driver/distribution/trips/' + trip._id + '/start',
    { bearer: repBToken, body: { revision: 0 } })).status, 403);
});

test('admin can assign and reassign planned trips, with optimistic revision', async () => {
  const trip = await Trip.findOne({ driverUserId: repA._id });
  const path = '/admin/distribution/trips/' + trip._id + '/assign-driver';
  assert.equal((await call('POST', path, {
    bearer: repAToken, body: { revision: 0, driverUserId: String(repB._id) },
  })).status, 403);
  assert.equal((await call('POST', path, {
    bearer: adminToken, body: { revision: 0, driverUserId: String(inactiveRep._id) },
  })).status, 400);
  const reassigned = await call('POST', path, {
    bearer: adminToken, body: { revision: 0, driverUserId: String(repB._id) },
  });
  assert.equal(reassigned.status, 200, JSON.stringify(reassigned.body));
  assert.equal(reassigned.body.trip.revision, 1);
  assert.equal(reassigned.body.trip.driverUserId, String(repB._id));
  assert.equal((await call('POST', path, {
    bearer: adminToken, body: { revision: 0, driverUserId: String(repA._id) },
  })).status, 409);
  assert.equal((await call('GET', '/driver/distribution/trips', { bearer: repAToken })).body.trips.length, 0);
  assert.equal((await call('GET', '/driver/distribution/trips', { bearer: repBToken })).body.trips.length, 1);
});

test('assigned driver starts, resolves stops and completes; cannot be reassigned afterwards', async () => {
  const trip = await Trip.findOne({ driverUserId: repB._id }).lean();
  const path = '/driver/distribution/trips/' + trip._id;
  const started = await call('POST', path + '/start', { bearer: repBToken, body: { revision: 1 } });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.trip.status, 'in_progress');
  assert.equal((await call('POST', '/admin/distribution/trips/' + trip._id + '/assign-driver',
    { bearer: adminToken, body: { revision: 2, driverUserId: String(repA._id) } })).status, 400);
  assert.equal((await call('PATCH', path + '/stops/' + trip.stops[0]._id,
    { bearer: repAToken, body: { revision: 2, status: 'delivered' } })).status, 403);
  const done = await call('PATCH', path + '/stops/' + trip.stops[0]._id, {
    bearer: repBToken, body: { revision: 2, status: 'delivered' },
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.trip.revision, 3);
  const completed = await call('POST', path + '/complete',
    { bearer: repBToken, body: { revision: 3 } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.trip.status, 'completed');
  assert.equal(await Event.countDocuments({ tripId: trip._id }), 5);
});
