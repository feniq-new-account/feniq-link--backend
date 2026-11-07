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

test('standalone external driver has only assigned trip and GPS permissions', async () => {
  const external = await User.create({
    name: 'External Transport Driver', phone: '0931400010', role: 'driver', status: 'active',
  });
  const pending = await User.create({
    name: 'Pending Driver', phone: '0931400011', role: 'driver', status: 'pending',
  });
  const driverToken = token(external);
  const pendingToken = token(pending);
  const directory = await call('GET', '/admin/distribution/drivers', { bearer: adminToken });
  assert.equal(directory.status, 200);
  assert.ok(directory.body.drivers.some(d => d.userId === String(external._id) && d.role === 'driver'));
  const body = {
    region: 'Jableh', driverName: external.name, serviceDate: '2026-11-09',
    pharmacyIds: [String(pharmacy._id)], driverUserId: String(external._id),
  };
  assert.equal((await call('POST', '/admin/distribution/trips', {
    bearer: adminToken, body: { ...body, driverUserId: String(pending._id) },
  })).status, 400);
  const created = await call('POST', '/admin/distribution/trips', {
    bearer: adminToken, body,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const tripId = created.body.trip._id;
  const path = '/driver/distribution/trips/' + tripId;
  assert.equal((await call('GET', '/driver/distribution/trips',
    { bearer: driverToken })).body.trips.length, 1);
  assert.equal((await call('GET', path, { bearer: repAToken })).status, 404);
  assert.equal((await call('GET', '/rep/me', { bearer: driverToken })).status, 403);
  assert.equal((await call('GET', '/admin/distribution/trips',
    { bearer: driverToken })).status, 403);
  assert.equal((await call('GET', '/driver/distribution/trips',
    { bearer: pendingToken })).status, 403);
  const fix = {
    latitude: 35.51, longitude: 35.84, accuracyMeters: 11,
    measuredAt: new Date().toISOString(),
  };
  assert.equal((await call('PUT', path + '/location',
    { bearer: driverToken, body: fix })).status, 403);
  const started = await call('POST', path + '/start', {
    bearer: driverToken, body: { revision: 0 },
  });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal((await call('PUT', path + '/location',
    { bearer: repAToken, body: fix })).status, 403);
  assert.equal((await call('PUT', path + '/location',
    { bearer: driverToken, body: fix })).status, 200);
  const tracked = await call('GET', '/admin/distribution/trips/' + tripId + '/location',
    { bearer: adminToken });
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.location.location.latitude, 35.51);
});

test('offline stop retry with same requestId is acknowledged once without duplicate events', async () => {
  const trip = await Trip.create({
    region: 'Rural delivery retry', serviceDate: new Date('2026-11-11T00:00:00Z'),
    driverName: 'Driver B', driverUserId: repB._id, createdBy: admin._id,
    status: 'in_progress', revision: 7,
    stops: [{ pharmacyId: pharmacy._id, pharmacyName: 'Pharmacy', address: 'Kasab road' }],
  });
  const path = '/driver/distribution/trips/' + trip._id + '/stops/' + trip.stops[0]._id;
  const body = { revision: 7, status: 'delivered', requestId: 'offline-delivery-uuid-20261106' };
  const first = await call('PATCH', path, { bearer: repBToken, body });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.trip.revision, 8);

  // Simulate an HTTP reply being lost and the device resending its original command.
  const replay = await call('PATCH', path, { bearer: repBToken, body });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.trip.revision, 8);
  assert.equal(replay.body.trip.stops[0].status, 'delivered');
  assert.equal(await Event.countDocuments({ tripId: trip._id, event: 'stop_delivered' }), 1);
  assert.equal((await Trip.findById(trip._id)).revision, 8);

  // No other actor can use the same identifier to access this trip.
  assert.equal((await call('PATCH', path, { bearer: repAToken, body })).status, 403);
  // Key reuse for a different semantic operation must fail, not silently succeed.
  assert.equal((await call('PATCH', path, {
    bearer: repBToken, body: { ...body, status: 'failed', note: 'Closed' },
  })).status, 409);
  assert.equal((await call('PATCH', path, {
    bearer: repBToken, body: { ...body, revision: 8 },
  })).status, 409);
  assert.equal((await call('PATCH', path, {
    bearer: repBToken, body: { ...body, requestId: 'short' },
  })).status, 400);

  // A different key cannot re-record the already completed delivery.
  const newKey = await call('PATCH', path, {
    bearer: repBToken, body: { ...body, revision: 8, requestId: 'different-key-delivery-20261106' },
  });
  assert.equal(newKey.status, 400);
  assert.equal(await Event.countDocuments({ tripId: trip._id }), 1);
});

test('offline retry remains acknowledged after the trip was subsequently completed', async () => {
  const trip = await Trip.create({
    region: 'Last stop before closing', serviceDate: new Date('2026-11-12T00:00:00Z'),
    driverName: 'Driver B', driverUserId: repB._id, createdBy: admin._id,
    status: 'in_progress', revision: 2,
    stops: [{ pharmacyId: pharmacy._id, pharmacyName: 'Pharmacy', address: 'Kasab road' }],
  });
  const path = '/driver/distribution/trips/' + trip._id;
  const body = { revision: 2, status: 'failed', note: 'Gate closed',
    requestId: 'offline-failed-delivery-20261106' };
  const stopPath = path + '/stops/' + trip.stops[0]._id;
  assert.equal((await call('PATCH', stopPath, { bearer: repBToken, body })).status, 200);
  assert.equal((await call('POST', path + '/complete', {
    bearer: repBToken, body: { revision: 3 },
  })).status, 200);
  const retried = await call('PATCH', stopPath, { bearer: repBToken, body });
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.trip.status, 'completed');
  assert.equal(await Event.countDocuments({ tripId: trip._id, event: 'stop_failed' }), 1);
  assert.equal(await Event.countDocuments({ tripId: trip._id, event: 'completed' }), 1);
});


test('six-role distribution matrix keeps admin operations private and driver trips assignment-scoped', async () => {
  // This is a READ-ONLY contract test: no financial records or shipment state
  // change. It exercises real HTTP middleware, not only hidden UI controls.
  const owner = await User.create({
    name: 'Warehouse Owner', phone: '0931400051',
    role: 'warehouse', warehouseRole: 'owner', status: 'active',
  });
  const accountant = await User.create({
    name: 'Warehouse Accountant', phone: '0931400052',
    role: 'warehouse', warehouseRole: 'accountant', status: 'active',
  });
  const pharmacist = await User.findById(pharmacy.userId);
  const standaloneDriver = await User.create({
    name: 'Unassigned Driver', phone: '0931400053',
    role: 'driver', status: 'active',
  });
  const roles = [
    ['warehouse owner', token(owner)],
    ['warehouse accountant', token(accountant)],
    ['pharmacist', token(pharmacist)],
    ['field rep', repAToken],
    ['external driver', token(standaloneDriver)],
  ];
  const adminOnly = [
    '/admin/distribution/overview',
    '/admin/distribution/trips',
    '/admin/distribution/drivers',
  ];
  for (const endpoint of adminOnly) {
    assert.equal((await call('GET', endpoint)).status, 401, endpoint);
    assert.equal((await call('GET', endpoint, { bearer: adminToken })).status, 200, endpoint);
    for (const [label, bearer] of roles) {
      const result = await call('GET', endpoint, { bearer });
      assert.equal(result.status, 403, label + ' accessed ' + endpoint);
    }
  }
  // Warehouse management and accounting roles must not inherit courier rights.
  for (const bearer of [token(owner), token(accountant), token(pharmacist)]) {
    assert.equal((await call('GET', '/driver/distribution/trips', { bearer })).status, 403);
  }
  assert.equal((await call('GET', '/driver/distribution/trips', { bearer: adminToken })).status, 403);

  // An eligible field rep or driver is allowed the courier API only for
  // trips assigned to the authenticated user; no other driver trips leak.
  for (const [user, bearer] of [
    [repA, repAToken], [repB, repBToken], [standaloneDriver, token(standaloneDriver)],
  ]) {
    const response = await call('GET', '/driver/distribution/trips', { bearer });
    assert.equal(response.status, 200, String(user._id));
    assert.match(response.body.success ? 'ok' : 'invalid', /ok/);
    for (const trip of response.body.trips) {
      assert.equal(String(trip.driverUserId), String(user._id), 'Foreign trip leaked');
    }
  }
  const unassigned = await call('GET', '/driver/distribution/trips', {
    bearer: token(standaloneDriver),
  });
  assert.equal(unassigned.body.trips.length, 0);
});


test('an integrated admin route, driver GPS, and offline-retried delivery complete safely', async () => {
  // One synthetic HTTP journey across the operational roles, using a disposable
  // replica set. No orders, invoices, payment or commission records are touched.
  const created = await call('POST', '/admin/distribution/trips', {
    bearer: adminToken,
    body: {
      region: 'Integrated rural delivery', serviceDate: '2026-11-14',
      driverName: 'Driver B', driverUserId: String(repB._id),
      pharmacyIds: [String(pharmacy._id)],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const tripId = created.body.trip._id;
  const adminPath = '/admin/distribution/trips/' + tripId;
  const driverPath = '/driver/distribution/trips/' + tripId;

  // These coordinates represent a recorded route imported by the admin UI.
  // No road path or location is inferred by the server.
  const route = [[35.51, 35.84], [35.515, 35.845]];
  const planned = await call('PUT', adminPath + '/route', {
    bearer: adminToken,
    body: { revision: 0, routePoints: route, routeCorridorMeters: 300 },
  });
  assert.equal(planned.status, 200, JSON.stringify(planned.body));
  assert.equal(planned.body.trip.revision, 1);
  assert.deepEqual(planned.body.trip.routePoints, route);
  assert.equal((await call('PUT', adminPath + '/route', {
    bearer: repBToken, body: { revision: 1, routePoints: route },
  })).status, 403);

  // Only the assigned driver may start and publish GPS. The admin sees
  // no_signal until the first fix, then a real live position on the route.
  assert.equal((await call('POST', driverPath + '/start', {
    bearer: repAToken, body: { revision: 1 },
  })).status, 403);
  const started = await call('POST', driverPath + '/start', {
    bearer: repBToken, body: { revision: 1 },
  });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.trip.revision, 2);
  const beforeGps = await call('GET', adminPath + '/location', { bearer: adminToken });
  assert.equal(beforeGps.status, 200);
  assert.equal(beforeGps.body.location.state, 'no_signal');
  const fix = await call('PUT', driverPath + '/location', {
    bearer: repBToken,
    body: {
      latitude: route[0][0], longitude: route[0][1],
      accuracyMeters: 8, measuredAt: new Date().toISOString(),
    },
  });
  assert.equal(fix.status, 200, JSON.stringify(fix.body));
  const monitored = await call('GET', adminPath + '/location', { bearer: adminToken });
  assert.equal(monitored.status, 200);
  assert.equal(monitored.body.location.state, 'live');
  assert.equal(monitored.body.location.deviation.state, 'on_route');
  assert.equal((await call('GET', adminPath + '/location', {
    bearer: repAToken,
  })).status, 403);

  // Simulate delivery while offline and the identical command being retried
  // after the server committed it but the phone lost its HTTP response.
  const stopId = created.body.trip.stops[0]._id;
  const stopPath = driverPath + '/stops/' + stopId;
  const command = {
    revision: 2, status: 'delivered',
    requestId: 'integrated-offline-delivery-20261107',
  };
  const delivered = await call('PATCH', stopPath, {
    bearer: repBToken, body: command,
  });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  assert.equal(delivered.body.trip.revision, 3);
  const replay = await call('PATCH', stopPath, {
    bearer: repBToken, body: command,
  });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.trip.revision, 3);
  assert.equal(await Event.countDocuments({
    tripId, event: 'stop_delivered',
  }), 1);

  // An old revision cannot complete twice; a completed trip cannot continue
  // broadcasting GPS, and replaying delivery still adds no audit event.
  const closed = await call('POST', driverPath + '/complete', {
    bearer: repBToken, body: { revision: 3 },
  });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.trip.status, 'completed');
  assert.equal(closed.body.trip.revision, 4);
  assert.equal((await call('GET', adminPath + '/location', {
    bearer: adminToken,
  })).body.location, null);
  assert.equal((await call('PUT', driverPath + '/location', {
    bearer: repBToken, body: {
      latitude: route[0][0], longitude: route[0][1],
      accuracyMeters: 8, measuredAt: new Date().toISOString(),
    },
  })).status, 403);
  const lateReplay = await call('PATCH', stopPath, {
    bearer: repBToken, body: command,
  });
  assert.equal(lateReplay.status, 200);
  assert.equal(lateReplay.body.trip.revision, 4);
  assert.equal(await Event.countDocuments({ tripId }), 4);
  assert.equal((await call('GET', driverPath, { bearer: repAToken })).status, 404);
});
