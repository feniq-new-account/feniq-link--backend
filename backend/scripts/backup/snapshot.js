// Streaming BSON-preserving backup at one MongoDB snapshot timestamp.
// No fallback to a moving read: unsupported/expired snapshots fail the backup.
const { mongo } = require('mongoose');
const { once } = require('node:events');
const { createInterface } = require('node:readline');
const { createGzip, createGunzip } = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const EJSON = mongo.BSON.EJSON;

async function write(output, record) {
  if (!output.write(EJSON.stringify(record, { relaxed: false }) + '\n')) await once(output, 'drain');
}
async function metadata(db) {
  const collections = await db.listCollections({ type: 'collection' }).toArray();
  const result = [];
  for (const { name, options } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    if (name.startsWith('system.')) continue;
    result.push({ name, options, indexes: await db.collection(name).listIndexes().toArray() });
  }
  return result;
}
async function dump(client, db, output) {
  const collections = await metadata(db);
  const session = client.startSession({ snapshot: true });
  try {
    await write(output, { format: 'feniq-snapshot-v1', database: db.databaseName, collections });
    const counts = {};
    for (const { name } of collections) {
      counts[name] = 0;
      for await (const doc of db.collection(name).find({}, { session })) {
        await write(output, { collection: name, doc });
        counts[name]++;
      }
    }
    // DDL isn't part of listCollections' snapshot API. Reject a concurrent
    // collection/index change rather than silently omit a newly added table.
    if (EJSON.stringify(collections) !== EJSON.stringify(await metadata(db))) throw new Error('Database schema changed during backup; retry.');
    await write(output, { complete: true, counts });
  } finally { await session.endSession(); }
}
async function restore(db, input, { drop = false } = {}) {
  let header; let complete = false; const counts = {};
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (!line) continue;
    if (complete) throw new Error('Unexpected data after snapshot footer.');
    const record = EJSON.parse(line, { relaxed: false });
    if (!header) {
      if (record.format !== 'feniq-snapshot-v1' || !Array.isArray(record.collections)) throw new Error('Invalid snapshot header.');
      header = record;
      const names = new Set();
      for (const { name, options } of header.collections) {
        if (typeof name !== 'string' || name.startsWith('system.') || names.has(name)) throw new Error('Invalid collection name.');
        names.add(name); counts[name] = 0;
        if (drop) await db.collection(name).drop().catch(err => { if (err.code !== 26) throw err; });
        if (!(await db.listCollections({ name }).hasNext())) await db.createCollection(name, options);
        else if (await db.collection(name).findOne({})) throw new Error('Restore requires empty target collections or --drop.');
      }
    } else if (record.complete === true) {
      if (EJSON.stringify(record.counts) !== EJSON.stringify(counts)) throw new Error('Snapshot document counts do not match.');
      complete = true;
    } else {
      if (!Object.hasOwn(counts, record.collection) || !record.doc) throw new Error('Invalid snapshot record.');
      await db.collection(record.collection).insertOne(record.doc);
      counts[record.collection]++;
    }
  }
  if (!complete) throw new Error('Incomplete snapshot: missing completion footer.');
  for (const { name, indexes } of header.collections) {
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      const { key, v, ns, ...options } = index;
      await db.collection(name).createIndex(key, options);
    }
  }
  return counts;
}
async function main() {
  const mode = process.argv[2];
  const uri = mode === 'dump' ? process.env.MONGODB_URI : process.env.RESTORE_MONGODB_URI;
  if (!uri || !['dump', 'restore'].includes(mode)) throw new Error('Set database URI and use snapshot.js dump|restore.');
  const client = new mongo.MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const db = client.db(mode === 'restore' ? process.env.RESTORE_DB : undefined);
    if (mode === 'dump') {
      const gzip = createGzip();
      const piping = pipeline(gzip, process.stdout);
      try { await dump(client, db, gzip); gzip.end(); await piping; }
      catch (err) { gzip.destroy(err); await piping.catch(() => {}); throw err; }
    } else {
      const gunzip = createGunzip();
      const piping = pipeline(process.stdin, gunzip);
      try { await restore(db, gunzip, { drop: process.env.RESTORE_DROP === '1' }); await piping; }
      catch (err) { gunzip.destroy(err); await piping.catch(() => {}); throw err; }
    }
  } finally { await client.close(); }
}
if (require.main === module) main().catch(err => { console.error('Snapshot operation failed:', err.message); process.exitCode = 1; });
module.exports = { dump, restore };
