// Migration 07 - the category's unique normalized key.
//
// Category.key is normalizeText(nameAr), with a unique index, so two
// spellings of one category ("صادات حيوية" / "صادات حيويه") cannot both exist
// - which is what stops two catalog imports racing to create the same new
// category from making two. Categories written before it have no key.
//
//  1. Sets `key` on every category whose key is missing or stale.
//  2. Categories that share a key are the same category: each group is merged
//     into its oldest category (its names, icon and order are kept) - every
//     catalog item and warehouse product filed under the others moves to it,
//     and the others are deleted. One transaction per group, as the admin
//     Categories screen's merge does.
//  3. Builds the unique `key_1` index.
//
// A category whose Arabic name has no letters at all normalizes to an empty
// key; --apply refuses while one exists (give it an Arabic name on the admin
// Categories screen, then re-run). Idempotent.
//
// Usage: node scripts/migrations/07-category-keys.js [--apply]
const mongoose = require('mongoose');
const { runCli } = require('./lib');
const { normalizeText } = require('../../src/utils/normalizeText');
const { runInTransaction } = require('../../src/utils/transaction');

async function run({ apply = false, log = () => {} } = {}) {
  const db = mongoose.connection.db;
  const categories = db.collection('categories');
  const catalog = db.collection('productcatalogs');
  const products = db.collection('products');

  const all = await categories.find({}, { projection: { nameAr: 1, nameEn: 1, key: 1 } }).sort({ _id: 1 }).toArray();
  const report = { keysSet: 0, categoriesWithoutArabicName: [], merged: [], keyIndex: null };

  const byKey = new Map();
  const keyUpdates = [];
  for (const category of all) {
    const key = normalizeText(category.nameAr);
    if (!key) {
      report.categoriesWithoutArabicName.push({ id: String(category._id), nameAr: category.nameAr ?? null, nameEn: category.nameEn ?? null });
      continue;
    }
    if (category.key !== key) keyUpdates.push({ updateOne: { filter: { _id: category._id }, update: { $set: { key } } } });
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(category); // oldest first: sorted by _id
  }
  report.keysSet = keyUpdates.length;
  if (report.categoriesWithoutArabicName.length > 0) {
    log(`${report.categoriesWithoutArabicName.length} category(ies) have no Arabic name: ${report.categoriesWithoutArabicName.map((c) => c.id).join(', ')}`);
    if (apply) {
      throw new Error(
        `Refusing --apply: ${report.categoriesWithoutArabicName.length} category(ies) have no Arabic name. Give each one on the admin Categories screen, then re-run.`
      );
    }
  }

  const groups = [...byKey.entries()].filter(([, members]) => members.length > 1);
  for (const [key, [survivor, ...losers]] of groups) {
    const loserIds = losers.map((category) => category._id);
    const entry = {
      key,
      kept: { id: String(survivor._id), nameAr: survivor.nameAr, nameEn: survivor.nameEn },
      merged: losers.map((category) => ({ id: String(category._id), nameAr: category.nameAr, nameEn: category.nameEn })),
      moved: {
        catalogItems: await catalog.countDocuments({ categoryId: { $in: loserIds } }),
        products: await products.countDocuments({ categoryId: { $in: loserIds } }),
      },
    };
    report.merged.push(entry);
    if (apply) {
      await runInTransaction(async (session) => {
        await catalog.updateMany({ categoryId: { $in: loserIds } }, { $set: { categoryId: survivor._id } }, { session });
        await products.updateMany({ categoryId: { $in: loserIds } }, { $set: { categoryId: survivor._id } }, { session });
        await categories.deleteMany({ _id: { $in: loserIds } }, { session });
      });
    }
    log(
      `  "${survivor.nameAr}" ${apply ? 'absorbed' : 'would absorb'} ${entry.merged.map((c) => `"${c.nameAr}"`).join(', ')} ` +
        `(${entry.moved.catalogItems} catalog item(s), ${entry.moved.products} product(s)).`
    );
  }

  if (apply && keyUpdates.length > 0) {
    // A merged-away category's update simply matches nothing any more.
    await categories.bulkWrite(keyUpdates, { ordered: false });
  }

  const indexes = await categories.indexes().catch(() => []);
  if (indexes.some((index) => index.name === 'key_1' && index.unique)) {
    report.keyIndex = 'already exists';
  } else if (apply) {
    await categories.createIndex({ key: 1 }, { unique: true, name: 'key_1' });
    report.keyIndex = 'created';
  } else {
    report.keyIndex = 'would be created';
  }

  log(
    `${report.keysSet} key(s) ${apply ? 'set' : 'to set'}; ${groups.length} duplicate group(s) ${apply ? 'merged' : 'to merge'}; ` +
      `key index: ${report.keyIndex}.`
  );
  return report;
}

module.exports = { run };

if (require.main === module) {
  runCli('07-category-keys', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
