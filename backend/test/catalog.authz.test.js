// Catalog overhaul Phase 12: every catalog route refuses a caller with no
// session (401) and a caller of the wrong role (403) - admin catalog and
// manufacturer screens, admin products, the warehouse's products, imports
// and catalog search, and the pharmacist's catalog. Nothing is read or
// written for them: each request carries a well-formed id, so the only thing
// standing between the caller and the handler is the auth check.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-catalog-authz-tests-000000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');

const ID = String(new mongoose.Types.ObjectId());
const tokens = {};
let server;
let baseUrl;

// [method, path, the one role allowed]
const ROUTES = [
  ['GET', '/admin/catalog', 'admin'],
  ['GET', '/admin/catalog/template', 'admin'],
  ['GET', '/admin/catalog/manufacturers', 'admin'],
  ['POST', '/admin/catalog/import', 'admin'],
  ['PATCH', `/admin/catalog/${ID}`, 'admin'],
  ['DELETE', `/admin/catalog/${ID}`, 'admin'],
  ['POST', `/admin/catalog/${ID}/image`, 'admin'],
  ['DELETE', `/admin/catalog/${ID}/image`, 'admin'],
  ['GET', '/admin/catalog/requests', 'admin'],
  ['POST', `/admin/catalog/requests/${ID}/approve`, 'admin'],
  ['POST', `/admin/catalog/requests/${ID}/merge`, 'admin'],
  ['POST', `/admin/catalog/requests/${ID}/reject`, 'admin'],
  ['GET', '/admin/catalog/duplicates', 'admin'],
  ['POST', `/admin/catalog/duplicates/${ID}/resolve`, 'admin'],
  ['GET', '/admin/manufacturers', 'admin'],
  ['PATCH', `/admin/manufacturers/${ID}`, 'admin'],
  ['POST', `/admin/manufacturers/${ID}/merge`, 'admin'],
  ['POST', `/admin/manufacturers/${ID}/logo`, 'admin'],
  ['DELETE', `/admin/manufacturers/${ID}/logo`, 'admin'],
  ['GET', '/admin/products', 'admin'],
  ['GET', '/admin/products/count', 'admin'],
  ['GET', '/admin/products/warehouses', 'admin'],
  ['PATCH', `/admin/products/${ID}`, 'admin'],
  ['DELETE', `/admin/products/${ID}`, 'admin'],
  ['GET', '/warehouse/products', 'warehouse'],
  ['GET', '/warehouse/products/search', 'warehouse'],
  ['GET', '/warehouse/products/template', 'warehouse'],
  ['POST', '/warehouse/products', 'warehouse'],
  ['PATCH', `/warehouse/products/${ID}`, 'warehouse'],
  ['POST', `/warehouse/products/${ID}/image`, 'warehouse'],
  ['POST', '/warehouse/products/import', 'warehouse'],
  ['GET', '/warehouse/products/imports', 'warehouse'],
  ['GET', `/warehouse/products/imports/${ID}`, 'warehouse'],
  ['GET', `/warehouse/products/imports/${ID}/rows`, 'warehouse'],
  ['POST', `/warehouse/products/imports/${ID}/rows/${ID}/resolve`, 'warehouse'],
  ['POST', `/warehouse/products/imports/${ID}/rows/${ID}/request`, 'warehouse'],
  ['GET', '/warehouse/catalog/search', 'warehouse'],
  ['GET', '/warehouse/catalog/requests', 'warehouse'],
  ['GET', '/warehouse/catalog/suggestions', 'warehouse'],
  ['GET', '/warehouse/manufacturers', 'warehouse'],
  ['GET', `/warehouses/${ID}/products`, 'pharmacy'],
  ['GET', `/warehouses/${ID}/manufacturers`, 'pharmacy'],
];

async function call(method, path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(baseUrl + path, { method, headers });
  await response.text();
  return response.status;
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-catalog-authz-test' });
  const users = await User.create([
    { name: 'AD', phone: '0952001201', role: 'admin', status: 'active' },
    { name: 'WH', phone: '0942001201', role: 'warehouse', status: 'active' },
    { name: 'PH', phone: '0932001201', role: 'pharmacy', status: 'active' },
    { name: 'WP', phone: '0942001202', role: 'warehouse', status: 'pending' },
  ]);
  for (const [key, user] of [['admin', users[0]], ['warehouse', users[1]], ['pharmacy', users[2]], ['pendingWarehouse', users[3]]]) {
    tokens[key] = jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: '1h' });
  }
  tokens.forged = jwt.sign({ sub: String(users[0]._id) }, 'not-the-server-secret', { expiresIn: '1h' });
  tokens.expired = jwt.sign({ sub: String(users[0]._id), exp: Math.floor(Date.now() / 1000) - 60 }, env.jwtSecret);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test('no session, a forged token or an expired one: 401 on every catalog route', async () => {
  for (const [method, path] of ROUTES) {
    for (const token of [null, tokens.forged, tokens.expired]) {
      assert.strictEqual(await call(method, path, token), 401, `${method} ${path}`);
    }
  }
});

test('the wrong role: 403 on every catalog route', async () => {
  for (const [method, path, allowed] of ROUTES) {
    for (const role of ['admin', 'warehouse', 'pharmacy'].filter((r) => r !== allowed)) {
      assert.strictEqual(await call(method, path, tokens[role]), 403, `${role} ${method} ${path}`);
    }
  }
});

test('a warehouse account still pending approval: 403 on the warehouse catalog routes', async () => {
  for (const [method, path, allowed] of ROUTES.filter(([, , role]) => role === 'warehouse')) {
    assert.strictEqual(await call(method, path, tokens.pendingWarehouse), 403, `${allowed} ${method} ${path}`);
  }
});

test('the unit list is open to every signed-in role, and only to them', async () => {
  assert.strictEqual(await call('GET', '/units', null), 401);
  for (const role of ['admin', 'warehouse', 'pharmacy']) {
    assert.strictEqual(await call('GET', '/units', tokens[role]), 200, role);
  }
});
