const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable, Readable } = require('node:stream');
const { finished } = require('node:stream/promises');
const mongoose = require('mongoose');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const { dump, restore } = require('../scripts/backup/snapshot');
const { verifyFinancial } = require('../scripts/backup/verify-financial');
let client;
test.before(async () => { await startMemoryMongo({ dbName: 'backup-snapshot-test' }); client = mongoose.connection.getClient(); });
test.after(stopMemoryMongo);
test('snapshot preserves BSON and indexes and excludes writes after the snapshot timestamp', async () => {
  const db = client.db('backup-snapshot-test'); const target = client.db('backup-restore-test');
  await db.collection('a').insertOne({ _id: 'one', at: new Date('2026-01-02'), large: mongoose.mongo.Long.fromString('9007199254740999') });
  await db.collection('b').insertOne({ _id: 'two', value: 'before' });
  await db.collection('b').createIndex({ value: 1 }, { unique: true });
  const chunks = [];
  const output = new Writable({ write(chunk, encoding, callback) {
    chunks.push(chunk.toString());
    if (chunk.toString().includes('"collection":"a"')) db.collection('b').updateOne({ _id: 'two' }, { $set: { value: 'after' } }).then(() => callback(), callback);
    else callback();
  } });
  try {
    await dump(client, db, output); output.end();
    // dump respects backpressure but does not own/end the caller's stream.
    // Its final write may still be queued behind the asynchronous source mutation.
    await finished(output);
    await restore(target, Readable.from(chunks));
    assert.equal((await target.collection('b').findOne({ _id: 'two' })).value, 'before');
    const doc = await target.collection('a').findOne({ _id: 'one' });
    assert.equal(doc.at.toISOString(), '2026-01-02T00:00:00.000Z');
    assert.equal(doc.large.toString(), '9007199254740999');
    await assert.rejects(target.collection('b').insertOne({ value: 'before' }), { code: 11000 });
    await assert.rejects(restore(client.db('backup-truncated-test'), Readable.from(chunks.slice(0, -1))), /Incomplete snapshot/);
  } finally { await target.dropDatabase(); await client.db('backup-truncated-test').dropDatabase(); }
});
test('financial restore verification fails on drift and missing source links without repairing records', async () => {
  const db = client.db('backup-financial-test'); const accountId = new mongoose.Types.ObjectId();
  await db.collection('ledgeraccounts').insertOne({ _id: accountId, seqCounter: 1, balanceCache: { syp: 100, usd: 1, lastEntrySeq: 1 } });
  const entry = await db.collection('ledgerentries').insertOne({ accountId, sequence: 1, direction: 'debit', amountSyp: 100, amountUsd: 1 });
  try {
    await verifyFinancial(db);
    await db.collection('ledgeraccounts').updateOne({ _id: accountId }, { $set: { 'balanceCache.syp': 200 } });
    await assert.rejects(verifyFinancial(db), /inconsistent ledger account/);
    assert.equal((await db.collection('ledgeraccounts').findOne({ _id: accountId })).balanceCache.syp, 200);
    await db.collection('ledgeraccounts').updateOne({ _id: accountId }, { $set: { 'balanceCache.syp': 100 } });
    await db.collection('orders').insertOne({ status: 'delivered' });
    await assert.rejects(verifyFinancial(db), /orders missing its ledger entry/);
    await db.collection('orders').updateOne({}, { $set: { chargeEntryId: entry.insertedId } });
    await verifyFinancial(db);
  } finally { await db.dropDatabase(); }
});

test('encrypted CLI backup restores the same snapshot and verifies finances', async () => {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const fs = require('node:fs/promises'); const os = require('node:os'); const path = require('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'feniq-backup-drill-'));
  const run = promisify(execFile); const host = client.options.hosts[0].toString();
  const sourceUri = `mongodb://${host}/backup-snapshot-test?replicaSet=${client.options.replicaSet}`;
  const targetUri = `mongodb://${host}/?replicaSet=${client.options.replicaSet}`;
  const env = { ...process.env, MONGODB_URI: sourceUri, BACKUP_ENCRYPTION_KEY: 'local-backup-test-passphrase-only' };
  try {
    await run('bash', [path.resolve('scripts/backup/backup.sh'), dir], { env });
    const files = await fs.readdir(dir); const file = path.join(dir, files.find(name => name.endsWith('.gpg')));
    assert.equal((await fs.readFile(file)).includes(Buffer.from('feniq-snapshot-v1')), false);
    await run('bash', [path.resolve('scripts/backup/restore.sh'), file, targetUri, '--to-db', 'backup-cli-restore', '--yes'], { env });
    await run(process.execPath, [path.resolve('scripts/backup/verify-restore.js'), '--target', targetUri, '--db', 'backup-cli-restore'], { env });
    assert.equal((await client.db('backup-cli-restore').collection('b').findOne({ _id: 'two' })).value, 'after');
  } finally { await fs.rm(dir, { recursive: true, force: true }); await client.db('backup-cli-restore').dropDatabase(); }
});
