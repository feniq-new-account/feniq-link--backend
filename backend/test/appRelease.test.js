process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'app-release-test-secret-at-least-32-characters';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1/unused';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const service = require('../src/services/appRelease.service');
const User = require('../src/models/user.model');
const AppRelease = require('../src/models/appRelease.model');

const roles = {
  pharmacy: { minimumBuild: 1, recommendedBuild: 1049, mandatoryAfter: null },
  rep: { minimumBuild: 1050, recommendedBuild: 1050, mandatoryAfter: '2026-10-30T12:00:00Z' },
  warehouse: { minimumBuild: 1, recommendedBuild: 1050, mandatoryAfter: null },
};
const manifest = { versionName: '1.0.1', applicationId: 'com.feniq.link', file: 'releases/1050-aaaaaaaaaaaa.apk', apk: true, build: '1050', size: 80000000, sha256: 'a'.repeat(64), certificateSha256: service.CERTIFICATE };
function fakeFetch(data = manifest, size = data.size) {
  return async (url, options) => options.method === 'HEAD'
    ? { ok: true, headers: new Headers({ 'content-length': String(size), 'content-type': 'application/vnd.android.package-archive' }) }
    : { ok: true, text: async () => JSON.stringify(data) };
}
let actor;
test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-app-release' });
  actor = await User.create({ name: 'Admin', phone: '+963944000020', role: 'admin', status: 'active' });
});
test.after(stopMemoryMongo);

test('only approved HTTPS sources are inspected; redirects cannot reach a different host', async () => {
  for (const source of ['http://feniq-site.onrender.com', 'https://127.0.0.1', 'https://feniq-site.onrender.com@127.0.0.1', 'https://feniq-site.onrender.com/path']) {
    await assert.rejects(service.inspectPublishedRelease(source, () => { throw new Error('Must not fetch'); }), { code: 'INVALID_APP_RELEASE' });
  }
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ url, options }); return fakeFetch()(url, options); };
  const artifact = await service.inspectPublishedRelease(undefined, fetcher);
  assert.equal(artifact.latestBuild, 1050);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.options.redirect === 'error'), true);
});

test('a wrong signing fingerprint, digest or file size cannot be published', async () => {
  for (const data of [{ ...manifest, certificateSha256: 'b'.repeat(64) }, { ...manifest, sha256: 'broken' }, { ...manifest, apk: false }]) {
    await assert.rejects(service.inspectPublishedRelease(undefined, fakeFetch(data)), { code: 'INVALID_APP_RELEASE' });
  }
  await assert.rejects(service.inspectPublishedRelease(undefined, fakeFetch(manifest, 1)), { code: 'INVALID_APP_RELEASE' });
});

test('rep-only mandatory updates leave supported pharmacy builds working', () => {
  const row = { enabled: true, roles };
  assert.equal(service.evaluateRole(row, 'rep', 1049, new Date('2026-10-30T11:59:59Z')), 'optional');
  assert.equal(service.evaluateRole(row, 'rep', 1049, new Date('2026-10-30T12:00:00Z')), 'mandatory');
  assert.equal(service.evaluateRole(row, 'pharmacy', 1049, new Date('2026-10-31T12:00:00Z')), 'none');
  assert.equal(service.evaluateRole(row, 'rep', 1050, new Date('2026-10-31T12:00:00Z')), 'none');
});

test('role minimums cannot point past the available APK or contain an invalid deadline', () => {
  assert.throws(() => service.validateRoles({ ...roles, rep: { ...roles.rep, minimumBuild: 1051 } }, 1050), { code: 'INVALID_APP_RELEASE' });
  assert.throws(() => service.validateRoles({ ...roles, rep: { ...roles.rep, mandatoryAfter: 'tomorrow' } }, 1050), { code: 'INVALID_APP_RELEASE' });
});

test('publishing is versioned, hides administrative history publicly, and rejects stale saves', async () => {
  const publishedRoles = { ...roles, rep: { ...roles.rep, mandatoryAfter: new Date(Date.now() - 1000).toISOString() } };
  const saved = await service.saveRelease(actor.id, { enabled: true, revision: 0, versionName: '1.0.1', roles: publishedRoles, notes: 'First release' }, { fetcher: fakeFetch() });
  assert.equal(saved.revision, 1);
  const publicView = service.publicRelease(saved);
  assert.equal(publicView.latestBuild, 1050);
  assert.equal(Object.hasOwn(publicView, 'updatedBy'), false);
  assert.equal(Object.hasOwn(publicView, 'history'), false);
  assert.equal(Object.hasOwn(publicView, 'notes'), false);
  await assert.rejects(service.saveRelease(actor.id, { enabled: false, revision: 0 }), { code: 'APP_RELEASE_CHANGED' });
});

test('the server rejects an expired mobile build using the authenticated role, while web access remains available', async () => {
  await assert.rejects(service.enforceMobileBuild({ headers: { 'x-feniq-client': 'android', 'x-app-build': '1049' } }, { role: 'rep' }), { code: 'APP_UPDATE_REQUIRED', statusCode: 426 });
  await service.enforceMobileBuild({ headers: { 'x-feniq-client': 'android', 'x-app-build': '1049' } }, { role: 'pharmacy' });
  await service.enforceMobileBuild({ headers: {} }, { role: 'rep' });
  await service.enforceMobileBuild({ headers: { 'x-feniq-client': 'android', 'x-app-build': '1' } }, { role: 'admin' });
});

test('disabling a bad update remains possible when the download origin is unavailable and preserves prior history', async () => {
  const disabled = await service.saveRelease(actor.id, { enabled: false, revision: 1 }, { fetcher: () => { throw new Error('Offline'); } });
  assert.equal(disabled.revision, 2);
  assert.equal(service.publicRelease(disabled), null);
  assert.equal(disabled.history.length, 1);
  await service.enforceMobileBuild({ headers: { 'x-feniq-client': 'android', 'x-app-build': '1049' } }, { role: 'rep' });
  assert.equal(await AppRelease.countDocuments(), 1);
});

test('malformed JSON values return a controlled invalid-manifest error, not a server TypeError', async () => {
  for (const data of [null, false, 123, 'text', [], [manifest]]) {
    await assert.rejects(service.inspectPublishedRelease(undefined, fakeFetch(data)), { code: 'INVALID_APP_RELEASE', statusCode: 400 });
  }
});
