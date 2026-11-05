process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'driver-gps-test-secret-longer-than-32-chars';
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
const Trip = require('../src/models/distributionTrip.model');
const Location = require('../src/models/distributionLiveLocation.model');

let server, baseUrl, admin, driver, outsider, trip;
const jwtFor = user => jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret);
async function call(method, path, { token, body } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
function gps(lat = 35.1, lon = 35.1) {
  return { latitude: lat, longitude: lon,
    accuracyMeters: 8, measuredAt: new Date().toISOString() };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-gps-privacy-test' });
  admin = await User.create({ name: 'Admin', phone: '0931510101', role: 'admin', status: 'active' });
  driver = await User.create({ name: 'Driver', phone: '0931510102', role: 'rep', status: 'active' });
  outsider = await User.create({ name: 'Other rep', phone: '0931510103', role: 'rep', status: 'active' });
  const warehouseId = new mongoose.Types.ObjectId();
  await Rep.create([
    { userId: driver._id, warehouseId, name: 'Driver', phone: driver.phone, isActive: true },
    { userId: outsider._id, warehouseId, name: 'Other rep', phone: outsider.phone, isActive: true },
  ]);
  trip = await Trip.create({
    region: 'Kasab', serviceDate: new Date('2026-11-06T00:00:00Z'),
    driverName: 'Driver', driverUserId: driver._id, createdBy: admin._id,
    status: 'planned', stops: [],
  });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api';
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});

test('only admin may configure route and only before trip starts', async () => {
  const route = [[35.1, 35], [35.1, 35.2]];
  const path = '/admin/distribution/trips/' + trip._id + '/route';
  assert.equal((await call('PUT', path,
    { token: jwtFor(driver), body: { revision: 0, routePoints: route } })).status, 403);
  assert.equal((await call('PUT', path,
    { token: jwtFor(admin), body: { revision: 0, routePoints: [[35.1, 35]] } })).status, 400);
  const created = await call('PUT', path, {
    token: jwtFor(admin), body: {
      revision: 0, routePoints: route, routeCorridorMeters: 300,
    },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.trip.revision, 1);
  assert.equal((await call('PUT', path,
    { token: jwtFor(admin), body: { revision: 0, routePoints: route } })).status, 409);
  const start = await call('POST', '/driver/distribution/trips/' + trip._id + '/start',
    { token: jwtFor(driver), body: { revision: 1 } });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  assert.equal((await call('PUT', path,
    { token: jwtFor(admin), body: { revision: 2, routePoints: route } })).status, 400);
});

test('driver GPS remains visible even when it goes off the planned route', async () => {
  const path = '/driver/distribution/trips/' + trip._id + '/location';
  assert.equal((await call('PUT', path,
    { token: jwtFor(outsider), body: gps() })).status, 403);
  assert.equal((await call('PUT', path,
    { token: jwtFor(admin), body: gps() })).status, 403);
  assert.equal((await call('PUT', path,
    { token: jwtFor(driver), body: { ...gps(), latitude: 100 } })).status, 400);
  const updated = await call('PUT', path, { token: jwtFor(driver), body: gps(35.112, 35.1) });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal((await call('GET', '/admin/distribution/trips/' + trip._id + '/location',
    { token: jwtFor(driver) })).status, 403);
  const monitored = await call('GET', '/admin/distribution/trips/' + trip._id + '/location',
    { token: jwtFor(admin) });
  assert.equal(monitored.status, 200, JSON.stringify(monitored.body));
  assert.equal(monitored.body.location.state, 'live');
  assert.equal(monitored.body.location.deviation.state, 'off_route');
  assert.equal(monitored.body.location.location.latitude, 35.112);
  assert.ok(monitored.body.location.deviation.distanceMeters > 1000);
  const rateLimited = await call('PUT', path, { token: jwtFor(driver), body: gps(35.111, 35.1) });
  assert.equal(rateLimited.status, 429);
});

test('GPS connection loss retains last known coordinates but removes false live alerts', async () => {
  await Location.updateOne({ tripId: trip._id }, {
    $set: { receivedAt: new Date(Date.now() - 5 * 60 * 1000) },
  });
  const response = await call('GET', '/admin/distribution/trips/' + trip._id + '/location',
    { token: jwtFor(admin) });
  assert.equal(response.status, 200);
  assert.equal(response.body.location.state, 'stale');
  assert.equal(response.body.location.deviation, null);
  assert.equal(response.body.location.location.latitude, 35.112);
});

test('completed trips do not accept or expose GPS even if an old fix exists', async () => {
  await Trip.updateOne({ _id: trip._id }, { $set: { status: 'completed' } });
  assert.equal((await call('PUT', '/driver/distribution/trips/' + trip._id + '/location',
    { token: jwtFor(driver), body: gps() })).status, 403);
  const response = await call('GET', '/admin/distribution/trips/' + trip._id + '/location',
    { token: jwtFor(admin) });
  assert.equal(response.status, 200);
  assert.equal(response.body.location, null);
});
