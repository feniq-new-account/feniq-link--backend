process.env.JWT_SECRET ||= 'pilot-notice-test-secret-32-characters';
process.env.NODE_ENV = 'test';
process.env.DISABLE_AUTH_RATE_LIMIT = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');
const app = require('../src/app');
const User = require('../src/models/user.model');
const RefreshToken = require('../src/models/refreshToken.model');
const PlatformSetting = require('../src/models/platformSetting.model');
const pilotNotice = require('../src/services/pilotNotice.service');

let server, baseUrl, adminToken, pharmacyToken;
async function request(method, route, body, token) {
  const res = await fetch(baseUrl + route, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), cacheControl: res.headers.get('cache-control') };
}
async function login(role, phone) {
  const password = 'SecurePilotPassword123';
  await User.create({ name: role, phone, role, status: 'active', password: await bcrypt.hash(password, 10) });
  const res = await request('POST', '/auth/login-password', { phone, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-persistent-pilot-notice' });
  await syncIndexes(User, PlatformSetting, RefreshToken);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  adminToken = await login('admin', '0944999911');
  pharmacyToken = await login('pharmacy', '0944999912');
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await stopMemoryMongo();
});

test('public notice is ON by default, visible without login, and excludes admin history', async () => {
  const { status, body, cacheControl } = await request('GET', '/app/pilot-notice');
  assert.equal(status, 200);
  assert.equal(cacheControl, 'no-store');
  assert.equal(body.notice.enabled, true);
  assert.match(body.notice.textAr, /نسخة تجريبية/);
  assert.equal(body.notice.history, undefined);
  assert.equal(body.notice.updatedBy, undefined);
  assert.equal(body.notice.revision, undefined);
});

test('only an active admin can edit the notice; update does not change ordering', async () => {
  const beforeLaunch = await request('GET', '/app/status');
  const before = await request('GET', '/admin/pilot-notice', undefined, adminToken);
  assert.equal(before.status, 200);
  assert.equal(before.body.configuration.revision, 0);
  const payload = { revision: 0, enabled: false,
    textAr: 'نسخة تجريبية: يتم التطوير', textEn: 'Trial version - under development' };
  assert.equal((await request('PUT', '/admin/pilot-notice', payload, pharmacyToken)).status, 403);
  assert.equal((await request('PUT', '/admin/pilot-notice', payload)).status, 401);
  const save = await request('PUT', '/admin/pilot-notice', payload, adminToken);
  assert.equal(save.status, 200, JSON.stringify(save.body));
  assert.equal(save.body.configuration.revision, 1);
  assert.equal(save.body.configuration.enabled, false);
  const publicState = await request('GET', '/app/pilot-notice');
  assert.equal(publicState.body.notice.enabled, false);
  assert.equal(publicState.body.notice.textAr, payload.textAr);
  assert.deepEqual((await request('GET', '/app/status')).body, beforeLaunch.body,
    'banner changes must never open or close checkout');
});

test('stale revisions and malformed texts are rejected without mutating settings', async () => {
  const stale = { revision: 0, enabled: true, textAr: 'new', textEn: 'New' };
  const old = await request('PUT', '/admin/pilot-notice', stale, adminToken);
  assert.equal(old.status, 409);
  assert.equal(old.body.code, 'PILOT_NOTICE_CHANGED');
  const bad = [
    { revision: 1, enabled: 'true', textAr: 'Hi', textEn: 'Hello' },
    { revision: 1, enabled: true, textAr: ' ', textEn: 'Hello' },
    { revision: 1, enabled: true, textAr: 'a'.repeat(241), textEn: 'Hello' },
    { revision: 1, enabled: true, textAr: 'Valid', textEn: 'Valid', orderingEnabled: true },
  ];
  for (const payload of bad) {
    const result = await request('PUT', '/admin/pilot-notice', payload, adminToken);
    assert.equal(result.status, 400, JSON.stringify(result.body));
  }
  const after = await request('GET', '/admin/pilot-notice', undefined, adminToken);
  assert.equal(after.body.configuration.revision, 1);
});

test('text edits keep history admin-only and can turn the same permanent notice back on', async () => {
  const saved = await request('PUT', '/admin/pilot-notice', {
    revision: 1, enabled: true,
    textAr: 'نسخة تجريبية من فينيق', textEn: 'Feniq trial version',
  }, adminToken);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.configuration.revision, 2);
  assert.equal(saved.body.configuration.history.length, 2);
  assert.equal(saved.body.configuration.history[1].enabled, false);
  assert.equal(pilotNotice.publicNotice(saved.body.configuration).enabled, true);
  const publicNotice = await request('GET', '/app/pilot-notice');
  assert.deepEqual(publicNotice.body.notice, {
    enabled: true,
    textAr: 'نسخة تجريبية من فينيق',
    textEn: 'Feniq trial version',
  });
});
