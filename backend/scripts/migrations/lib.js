// Shared plumbing for the catalog-overhaul migrations (see MIGRATIONS.md).
//
// Every migration:
//  - exports `run({ apply, log })`, which does the work against whatever
//    connection mongoose already has open (so the tests can call it against
//    an in-memory database) and returns a plain report object;
//  - is a DRY RUN unless `apply` is true: it computes and prints exactly what
//    it would change, and writes nothing;
//  - is idempotent: running it again after it applied finds nothing left to do.
//
// `runCli(run)` is the command-line entry: connects to env.mongodbUri, runs,
// prints the report, disconnects. `--apply` is the only flag.
require('dotenv').config();
const mongoose = require('mongoose');

function isApply(argv = process.argv) {
  return argv.includes('--apply');
}

function makeLogger(prefix) {
  return (...args) => console.log(prefix, ...args);
}

async function runCli(name, run) {
  const env = require('../../src/config/env');
  const apply = isApply();
  const log = makeLogger(`[${name}]`);
  log(apply ? 'APPLY mode - changes will be written.' : 'DRY RUN - nothing will be written. Re-run with --apply to write.');
  await mongoose.connect(env.mongodbUri);
  try {
    const report = await run({ apply, log });
    log('report:', JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

// Drops an index by name if it exists; returns whether it was there.
async function dropIndexIfExists(collection, indexName, { apply, log }) {
  const indexes = await collection.indexes().catch(() => []);
  if (!indexes.some((index) => index.name === indexName)) return false;
  log(`${apply ? 'dropping' : 'would drop'} index ${collection.collectionName}.${indexName}`);
  if (apply) await collection.dropIndex(indexName);
  return true;
}

// Runs a list of bulkWrite operations in batches (a real catalog can mean tens
// of thousands of them).
async function bulkWriteInBatches(collection, operations, { apply, batchSize = 500 }) {
  if (!apply || operations.length === 0) return 0;
  let modified = 0;
  for (let start = 0; start < operations.length; start += batchSize) {
    const result = await collection.bulkWrite(operations.slice(start, start + batchSize), { ordered: false });
    modified += (result.modifiedCount ?? 0) + (result.upsertedCount ?? 0) + (result.insertedCount ?? 0);
  }
  return modified;
}

// Every catalog item must have an Arabic name: it is the name every screen
// shows and what the identity key is built from. Items written without one
// (English-only items created while that was briefly allowed during testing)
// are listed by the migrations that touch the catalog (00, 02, 04), and
// those refuse --apply until each has one - give it an Arabic name in the
// admin catalog, then re-run. A dry run reports them and carries on.
async function requireArabicNames(db, { apply, log }) {
  const missing = await db
    .collection('productcatalogs')
    .find(
      { $or: [{ nameAr: { $in: [null, ''] } }, { nameAr: /^\s*$/ }] },
      { projection: { nameEn: 1, manufacturerAr: 1 } }
    )
    .toArray();
  const list = missing.map((item) => ({
    id: String(item._id),
    nameEn: item.nameEn ?? null,
    manufacturerAr: item.manufacturerAr ?? null,
  }));
  if (list.length > 0) {
    log(`${list.length} catalog item(s) have no Arabic name: ${list.map((item) => `${item.id} (${item.nameEn ?? '-'})`).join(', ')}`);
    if (apply) {
      throw new Error(
        `Refusing --apply: ${list.length} catalog item(s) have no Arabic name. Give each one an Arabic name in the admin catalog, then re-run.`
      );
    }
  }
  return list;
}

module.exports = { isApply, makeLogger, runCli, dropIndexIfExists, bulkWriteInBatches, requireArabicNames };
