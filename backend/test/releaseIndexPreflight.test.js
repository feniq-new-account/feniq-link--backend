process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1/unused';
process.env.JWT_SECRET ||= 'release-index-test-secret-at-least-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const { inspectRegistrationIndex } = require('../scripts/check-pharmacist-launch-index');
let users;
test.before(async () => { await startMemoryMongo({ dbName: 'release_index_preflight', orderingOpen: false }); });
test.after(async () => { await stopMemoryMongo(); });
test('a missing collection is reported without creating it', async () => {
  const before = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  assert.equal((await inspectRegistrationIndex(mongoose.connection.collection('users'))).ready, false);
  assert.deepEqual(await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray(), before);
  users = await mongoose.connection.db.createCollection('users');
  await users.insertOne({ legacyMarker: 'unchanged', phone: '0944000001' });
});
test('nonunique, nonsparse, partial, compound and locale indexes cannot establish registration readiness', async () => {
  const variants = [
    [{ registrationPhoneKey: 1 }, {}],
    [{ registrationPhoneKey: 1 }, { unique: true }],
    [{ registrationPhoneKey: 1 }, { unique: true, partialFilterExpression: { status: 'active' } }],
    [{ registrationPhoneKey: 1, role: 1 }, { unique: true, sparse: true }],
    [{ registrationPhoneKey: 1 }, { unique: true, sparse: true, collation: { locale: 'en', strength: 1 } }],
  ];
  for (const [key, options] of variants) {
    await users.dropIndexes();
    await users.createIndex(key, { ...options, name: 'fixture_index' });
    const indexes = await users.indexes(), documents = await users.find().toArray();
    assert.equal((await inspectRegistrationIndex(users)).ready, false);
    assert.deepEqual(await users.indexes(), indexes, 'inspection does not repair or replace an index');
    assert.deepEqual(await users.find().toArray(), documents, 'legacy records stay unchanged');
  }
});
test('an exact unique sparse index is accepted independently of its name', async () => {
  await users.dropIndexes();
  await users.createIndex({ registrationPhoneKey: 1 }, { unique: true, sparse: true, name: 'valid_custom_name' });
  const before = await users.indexes();
  assert.deepEqual(await inspectRegistrationIndex(users), { ready: true, code: 'REGISTRATION_INDEX_READY' });
  assert.deepEqual(await users.indexes(), before);
});
test('check-only CLI reports failure then success without creating an index or changing rows', async () => {
  const script = path.resolve(__dirname, '../scripts/check-pharmacist-launch-index.js');
  const env = { ...process.env, NODE_ENV: 'test', MONGODB_URI: mongoose.connection.getClient().s.url };
  delete env.JWT_SECRET;
  await users.dropIndexes();
  const rows = await users.find().toArray(), indexes = await users.indexes();
  const missing = spawnSync(process.execPath, [script, '--check-only'], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(missing.status, 1, missing.stderr);
  assert.equal(JSON.parse(missing.stdout).readOnly, true);
  assert.equal(JSON.parse(missing.stdout).code, 'REGISTRATION_INDEX_MISSING');
  assert.deepEqual(await users.indexes(), indexes);
  await users.createIndex({ registrationPhoneKey: 1 }, { unique: true, sparse: true });
  const ready = spawnSync(process.execPath, [script, '--check-only'], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(JSON.parse(ready.stdout).ready, true);
  assert.deepEqual(await users.find().toArray(), rows);
});
