// Checks a restored database: lists every collection with its document count
// and, when the source is given, compares against it.
//
//   node scripts/backup/verify-restore.js --target <uri> --db <name> [--source <uri> --source-db <name>]
//
// Fails (exit 1) when the restored database is empty or is missing a
// collection the source has. Count differences are only reported: the source
// keeps taking writes while the dump runs, so a few documents either way is
// expected, not a broken backup.
const { mongo } = require('mongoose');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

async function countsFor(uri, dbName) {
  const client = new mongo.MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const db = client.db(dbName);
    const collections = await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
    const counts = {};
    for (const { name } of collections) {
      if (name.startsWith('system.')) continue;
      counts[name] = await db.collection(name).estimatedDocumentCount();
    }
    return counts;
  } finally {
    await client.close();
  }
}

async function main() {
  const target = arg('target');
  const dbName = arg('db');
  if (!target || !dbName) {
    console.error('Usage: verify-restore.js --target <uri> --db <name> [--source <uri> --source-db <name>]');
    process.exit(2);
  }
  const restored = await countsFor(target, dbName);
  const source = arg('source') ? await countsFor(arg('source'), arg('source-db') || 'feniq') : null;

  const names = [...new Set([...Object.keys(restored), ...Object.keys(source || {})])].sort();
  let total = 0;
  let missing = 0;
  for (const name of names) {
    const r = restored[name];
    total += r || 0;
    if (source) {
      const s = source[name];
      if (s !== undefined && r === undefined) missing += 1;
      const note = r === undefined ? '  <-- MISSING' : s !== undefined && s !== r ? `  (source now ${s})` : '';
      console.log(`${name.padEnd(36)} ${String(r ?? '-').padStart(8)}${note}`);
    } else {
      console.log(`${name.padEnd(36)} ${String(r).padStart(8)}`);
    }
  }
  console.log(`${Object.keys(restored).length} collections, ${total} documents restored.`);

  // An empty restore is only acceptable when the source itself is empty
  // (a brand-new deployment).
  if (Object.keys(restored).length === 0 && (!source || Object.keys(source).length > 0)) {
    console.error('FAIL: the restored database is empty.');
    process.exit(1);
  }
  if (missing > 0) {
    console.error(`FAIL: ${missing} collection(s) present in the source are missing from the restore.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
