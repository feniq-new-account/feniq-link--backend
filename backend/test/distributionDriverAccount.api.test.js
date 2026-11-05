process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'driver-account-test-secret-longer-than-32-chars';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Rep = require('../src/models/rep.model');

let server, baseUrl, adminToken, repToken;
async function call(method, path, bearer, body) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-external-driver-onboarding' });
  const admin = await User.create({
    name: 'Admin', phone: '0931200001', role: 'admin', status: 'active',
  });
  const rep = await User.create({
    name: 'Rep', phone: '0931200002', role: 'rep', status: 'active',
  });
  adminToken = jwt.sign({ sub: String(admin._id), role: admin.role }, env.jwtSecret);
  repToken = jwt.sign({ sub: String(rep._id), role: rep.role }, env.jwtSecret);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/api';
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});

test('driver onboarding is admin-only with credential and identity validation', async () => {
  const url = '/admin/distribution/drivers';
  const body = { name: 'Transport Driver', phone: '0931200003', password: 'temporary-secret-123' };
  assert.equal((await call('POST', url, null, body)).status, 401);
  assert.equal((await call('POST', url, repToken, body)).status, 403);
  assert.equal((await call('POST', url, adminToken, { ...body, name: ' ' })).status, 400);
  assert.equal((await call('POST', url, adminToken, { ...body, phone: 'not-a-phone' })).status, 400);
  assert.equal((await call('POST', url, adminToken, { ...body, password: 'short' })).status, 400);
  const result = await call('POST', url, adminToken, body);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.driver.role, 'driver');
  assert.equal(result.body.driver.status, 'active');
  assert.equal(result.body.driver.phone, '+963931200003');
  assert.equal(result.body.driver.mustChangePassword, true);
  assert.equal(JSON.stringify(result.body).includes('temporary-secret-123'), false);
  assert.equal(Object.hasOwn(result.body.driver, 'password'), false);

  const user = await User.findById(result.body.driver.userId).select('+password');
  assert.equal(user.role, 'driver');
  assert.equal(user.mustChangePassword, true);
  assert.equal(await bcrypt.compare(body.password, user.password), true);
  assert.equal(await Rep.exists({ userId: user._id }), null);

  const duplicate = await call('POST', url, adminToken, { ...body, phone: '+963931200003' });
  assert.equal(duplicate.status, 409);
  const directory = await call('GET', url, adminToken);
  assert.equal(directory.status, 200);
  assert.ok(directory.body.drivers.some(d => d.userId === String(user._id) && d.role === 'driver'));
});
