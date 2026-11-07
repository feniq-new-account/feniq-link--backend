process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1/unused';
process.env.JWT_SECRET = 'ratings-runtime-test-only-secret-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { Types } = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Order = require('../src/models/order.model');
const Review = require('../src/models/review.model');
const Setting = require('../src/models/platformSetting.model');
const Audit = require('../src/models/featureControlAudit.model');
const control = require('../src/services/featureControl.service');
const runtime = require('../src/services/runtimeFeatures.service');
let admin, owner, pharmacyUser, blocked, wh, pharmacy, server, base;
async function request(user, path, method = 'GET', body) {
  const token = user && jwt.sign({ sub: user.id, role: user.role, tokenVersion: 0 }, process.env.JWT_SECRET);
  const result = await fetch(base + path, { method, headers: { 'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: result.status, headers: result.headers, body: await result.json() };
}
async function toggle(enabled) {
  const { revision } = await control.readPlatform();
  const result = await request(admin, '/admin/feature-control', 'PUT', {
    revision, reason: 'Isolated ratings acceptance', features: { mutualRatings: enabled },
  });
  assert.equal(result.status, 200);
}
test.before(async () => {
  await startMemoryMongo({ dbName: 'ratings-runtime' });
  [admin, owner, pharmacyUser, blocked] = await User.create([
    { name: 'Admin', phone: '0944000001', role: 'admin', status: 'active' },
    { name: 'Owner', phone: '0944000002', role: 'warehouse', status: 'active' },
    { name: 'Pharmacy', phone: '0944000003', role: 'pharmacy', status: 'active' },
    { name: 'Blocked admin', phone: '0944000004', role: 'admin', status: 'blocked' },
  ]);
  wh = await Warehouse.create({ userId: owner.id, nameAr: 'مستودع', nameEn: 'Test', address: 'x', city: 'Latakia', phone: owner.phone });
  pharmacy = await Pharmacy.create({ userId: pharmacyUser.id, nameAr: 'صيدلية', nameEn: 'Test', ownerName: 'Owner',
    address: 'x', city: 'Latakia', phone: pharmacyUser.phone, areaType: 'city', addedBy: 'self' });
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await stopMemoryMongo(); });

test('only active admins can persist a boolean platform flag; it cannot become a warehouse entitlement', async () => {
  const body = { revision: 0, reason: 'Access test', features: { mutualRatings: false } };
  for (const user of [null, owner, pharmacyUser, blocked]) {
    assert.ok([401, 403].includes((await request(user, '/admin/feature-control', 'PUT', body)).status));
  }
  assert.equal(await Setting.countDocuments({ key: 'featureControl' }), 0);
  assert.equal((await request(admin, '/admin/feature-control', 'PUT', { ...body, features: { mutualRatings: 'false' } })).status, 400);
  await assert.rejects(control.configureWarehouse(wh.id, owner.id, body), { code: 'INVALID_FEATURE_CONTROL' });
  const definition = await request(admin, '/admin/feature-control');
  assert.ok(definition.body.platformFeatureNames.includes('mutualRatings'));
  assert.equal(definition.body.featureNames.includes('mutualRatings'), false);
  await toggle(false);
  assert.equal((await Setting.findOne({ key: 'featureControl' }).lean()).value.features.mutualRatings, false);
  // A fresh module load reads MongoDB, not a process-local copy.
  delete require.cache[require.resolve('../src/services/runtimeFeatures.service')];
  assert.equal((await require('../src/services/runtimeFeatures.service').readRuntimeFeatures()).mutualRatings, false);
  const publicFlags = await request(null, '/app/features');
  assert.equal(publicFlags.headers.get('cache-control'), 'no-store');
  assert.deepEqual(publicFlags.body, { success: true, features: { mutualRatings: false } });
  assert.equal(await Audit.countDocuments({ action: 'platform.features.updated' }), 1);
});

test('OFF rejects both POST paths and hides reads; ON restores creation and unchanged historical reviews', async () => {
  await toggle(false);
  // Synthetic delivered orders only; no financial writes or real accounts.
  const orderIds = [new Types.ObjectId(), new Types.ObjectId()];
  await Order.collection.insertMany(orderIds.map((_id, i) => ({ _id, orderNumber: i + 1,
    pharmacyId: pharmacy._id, warehouseId: wh._id, status: 'delivered' })));
  const paths = ['/reviews', '/warehouse/reviews'];
  const users = [pharmacyUser, owner];
  for (let i = 0; i < 2; i++) {
    const denied = await request(users[i], paths[i], 'POST', { orderId: String(orderIds[0]), rating: 4 });
    assert.equal(denied.status, 403); assert.equal(denied.body.code, 'RATINGS_DISABLED');
  }
  assert.equal(await Review.countDocuments(), 0);
  await toggle(true);
  for (let i = 0; i < 2; i++) assert.equal((await request(users[i], paths[i], 'POST', { orderId: String(orderIds[0]), rating: 4 })).status, 201);
  const before = await Review.find().sort({ _id: 1 }).lean();
  const counters = await Pharmacy.findById(pharmacy.id).select('averageRating reviewsCount').lean();
  await toggle(false);
  for (let i = 0; i < 2; i++) {
    const hidden = await request(users[i], paths[i]);
    assert.equal(hidden.status, 200); assert.deepEqual(hidden.body.reviews, []);
    for (const orderId of orderIds) assert.equal((await request(users[i], paths[i], 'POST', { orderId: String(orderId), rating: 5 })).status, 403);
  }
  assert.deepEqual(await Review.find().sort({ _id: 1 }).lean(), before);
  assert.deepEqual(await Pharmacy.findById(pharmacy.id).select('averageRating reviewsCount').lean(), counters);
  await toggle(true);
  assert.equal((await runtime.readRuntimeFeatures()).mutualRatings, true);
  for (let i = 0; i < 2; i++) {
    assert.equal((await request(users[i], paths[i])).body.reviews.length, 1);
  }
  for (let i = 0; i < 2; i++) {
    assert.equal((await request(users[i], paths[i], 'POST', { orderId: String(orderIds[1]), rating: 5 })).status, 201);
  }
  assert.deepEqual(await Review.find({ _id: { $in: before.map(r => r._id) } }).sort({ _id: 1 }).lean(), before);
});
