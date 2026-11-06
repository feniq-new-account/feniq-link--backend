process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-operations-test-secret-longer-than-32-chars';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Trip = require('../src/models/distributionTrip.model');
const Location = require('../src/models/distributionLiveLocation.model');

let server, base, admin, driver, trip;
const token = user => jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret);
async function get(bearer) {
  const response = await fetch(base + '/api/admin/distribution/overview', {
    headers: bearer ? { authorization: 'Bearer ' + bearer } : {},
  });
  return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-distribution-overview-test' });
  admin = await User.create({ name: 'Admin', phone: '0931900011', role: 'admin', status: 'active' });
  driver = await User.create({ name: 'Transport', phone: '0931900012', role: 'driver', status: 'active' });
  const pharmacyId = new mongoose.Types.ObjectId();
  const baseTrip = {
    region: 'Kasab', driverName: 'Transport', createdBy: admin._id,
    serviceDate: new Date('2026-11-06T00:00:00Z'),
    driverUserId: driver._id,
  };
  trip = await Trip.create({ ...baseTrip, status: 'in_progress',
    routePoints: [[35.5, 35.80], [35.5, 35.95]],
    stops: [
      { pharmacyId, pharmacyName: 'First', address: 'Main', status: 'pending' },
      { pharmacyId: new mongoose.Types.ObjectId(), pharmacyName: 'Second',
        address: 'North', status: 'delivered' },
    ],
  });
  await Trip.create({ ...baseTrip, status: 'planned', stops: [] });
  await Trip.create({ ...baseTrip, status: 'completed', stops: [] });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});

test('operations overview is private and restricted to platform admins', async () => {
  assert.equal((await get()).status, 401);
  assert.equal((await get(token(driver))).status, 403);
  const response = await get(token(admin));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.match(response.cache, /no-store/);
  const result = response.body.overview;
  assert.deepEqual(result.statuses, {
    planned: 1, in_progress: 1, completed: 1, cancelled: 0,
  });
  assert.equal(result.pendingStops, 1);
  assert.equal(result.activeListLimited, false);
  assert.equal(result.activeTrips.length, 1);
  assert.equal(result.activeTrips[0].pendingStops, 1);
  assert.equal(result.activeTrips[0].totalStops, 2);
  assert.equal(result.activeTrips[0].gpsState, 'no_signal');
  assert.equal(result.activeTrips[0].offRoute, false);
  assert.equal(result.activeTrips[0].driverAssigned, true);
  assert.equal(JSON.stringify(result).includes('amountSyp'), false);
  assert.equal(JSON.stringify(result).includes('phone'), false);
});

test('fresh off-route and stale readings remain explicitly distinguishable', async () => {
  const now = new Date();
  await Location.create({ tripId: trip._id, driverUserId: driver._id,
    latitude: 35.52, longitude: 35.86, accuracyMeters: 9,
    measuredAt: now, receivedAt: now, expiresAt: new Date(now.getTime() + 3600000),
  });
  const fresh = await get(token(admin));
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.equal(fresh.body.overview.activeTrips[0].gpsState, 'live');
  assert.equal(fresh.body.overview.activeTrips[0].offRoute, true);
  await Location.updateOne({ tripId: trip._id },
    { $set: { measuredAt: new Date(Date.now() - 4 * 60000) } });
  const stale = await get(token(admin));
  assert.equal(stale.status, 200);
  assert.equal(stale.body.overview.activeTrips[0].gpsState, 'stale');
  assert.equal(stale.body.overview.activeTrips[0].offRoute, false);
  assert.ok(stale.body.overview.activeTrips[0].gpsMeasuredAt);
});

test('completed trips disappear from the active-watchlist without deleting history', async () => {
  await Trip.updateOne({ _id: trip._id }, { $set: { status: 'completed' } });
  const response = await get(token(admin));
  assert.equal(response.status, 200);
  assert.equal(response.body.overview.activeTrips.length, 0);
  assert.equal(response.body.overview.statuses.completed, 2);
  assert.equal(response.body.overview.pendingStops, 0);
});
