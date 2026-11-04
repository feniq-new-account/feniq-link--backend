process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'visit-verification-test-secret-at-least-32-characters';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Audit = require('../src/models/pharmacyLocationAudit.model');
const PlatformSetting = require('../src/models/platformSetting.model');
const service = require('../src/services/visitVerification.service');
const { judgeVisit } = require('../src/services/repPortal.service');
let admin, pharmacyUser, pharmacy, server, base;
const point = [35.7915, 35.5196];
async function request(user, path, method = 'GET', body) {
  const token = jwt.sign({ sub: user.id, role: user.role, tokenVersion: 0 }, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/admin/visit-verification${path}`, { method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'visit-verification' });
  await PlatformSetting.init();
  admin = await User.create({ name: 'Admin', phone: '+963944100001', role: 'admin', status: 'active' });
  pharmacyUser = await User.create({ name: 'Pharmacist', phone: '+963944100002', role: 'pharmacy', status: 'active' });
  pharmacy = await Pharmacy.create({ userId: pharmacyUser.id, nameAr: 'صيدلية', nameEn: 'Pharmacy', ownerName: 'Owner',
    address: 'Latakia', city: 'Latakia', phone: pharmacyUser.phone, areaType: 'city', addedBy: 'self',
    location: { type: 'Point', coordinates: point } });
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); await stopMemoryMongo(); });

test('default policy separates 150m range, 100m uncertainty and a fresh reading', async () => {
  const result = await request(admin, '');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.policy, { radiusMeters: 150, maxAccuracyMeters: 100, maxAgeSeconds: 120, version: 0 });
  assert.equal((await request(pharmacyUser, '')).status, 403);
});
test('submitted coordinates await admin approval and pending pharmacies can be found', async () => {
  const result = await request(admin, '/pharmacies?approval=pending');
  assert.equal(result.status, 200);
  assert.equal(result.body.pharmacies[0].approval, 'pending');
  const now = new Date();
  const row = await Pharmacy.findById(pharmacy.id).lean();
  assert.equal(judgeVisit({ pharmacy: row, coordinates: point, accuracyMeters: 10, capturedAt: now.toISOString(), now }).status, 'location_unapproved');
});
test('only admin can approve a location; changes are audited and stale edits cannot overwrite it', async () => {
  const body = { latitude: point[1], longitude: point[0], approval: 'approved', version: 0 };
  assert.equal((await request(pharmacyUser, `/pharmacies/${pharmacy.id}`, 'PUT', body)).status, 403);
  const approved = await request(admin, `/pharmacies/${pharmacy.id}`, 'PUT', body);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.pharmacy.approval, 'approved');
  assert.equal(approved.body.pharmacy.version, 1);
  assert.equal(await Audit.countDocuments({ pharmacyId: pharmacy.id, actorId: admin.id }), 1);
  const stale = await request(admin, `/pharmacies/${pharmacy.id}`, 'PUT', { ...body, latitude: 0 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'PHARMACY_LOCATION_CHANGED');
  assert.deepEqual((await Pharmacy.findById(pharmacy.id)).location.coordinates, point);
});
test('policy updates validate bounds and serialize competing administrator changes', async () => {
  const policy = { radiusMeters: 100, maxAccuracyMeters: 50, maxAgeSeconds: 60, version: 0 };
  const responses = await Promise.all([request(admin, '', 'PUT', policy), request(admin, '', 'PUT', policy)]);
  assert.deepEqual(responses.map((row) => row.status).sort(), [200, 409]);
  assert.equal((await service.getPolicy()).version, 1);
  assert.equal((await request(admin, '', 'PUT', { ...policy, version: 1, maxAccuracyMeters: 1000 })).status, 400);
  assert.equal((await service.getPolicy()).maxAccuracyMeters, 50);
});
test('location can be withdrawn without rewriting historical visit outcomes', async () => {
  const result = await request(admin, `/pharmacies/${pharmacy.id}`, 'PUT', {
    latitude: point[1], longitude: point[0], approval: 'pending', version: 1,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.pharmacy.approval, 'pending');
  assert.equal(await Audit.countDocuments({ pharmacyId: pharmacy.id }), 2);
});
