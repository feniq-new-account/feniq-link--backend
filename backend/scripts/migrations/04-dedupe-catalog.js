// Migration 04 - catalog dedupe (catalog overhaul §1.6.3).
//
// Groups catalog items that share an identityKey - the same medicine from the
// same manufacturer, spelled differently - and for each group:
//
//  - AUTO-MERGES it only when that is safe (catalogMerge.service.js's
//    analyzeGroup): no warehouse has products linked to more than one item of
//    the group, and all items agree on being active. The survivor is the
//    oldest item (lowest _id); products, aliases and requests are repointed to
//    it, an image any item had is kept, and the others are deleted - one
//    transaction per group (utils/transaction.js).
//  - Otherwise files it in CatalogDuplicateReview for the admin's Duplicate
//    review screen, which resolves it through the same merge routine.
//
// Finally builds the unique index on identityKey - but only when no duplicate
// remains; otherwise it prints the groups that block it. Until then the index
// simply does not exist (nothing depends on it for correctness; the import and
// the admin edit already look items up by identityKey).
//
// Runs after 02-search-keys.js (it needs the keys). Idempotent: merged groups
// are gone, and an open review for the same identityKey is refreshed rather
// than filed twice.
//
// Usage: node scripts/migrations/04-dedupe-catalog.js [--apply]
const mongoose = require('mongoose');
const { runInTransaction } = require('../../src/utils/transaction');
const ProductCatalog = require('../../src/models/productCatalog.model');
const CatalogDuplicateReview = require('../../src/models/catalogDuplicateReview.model');
const { analyzeGroup, mergeCatalogItems } = require('../../src/services/catalogMerge.service');
const { runCli, requireArabicNames } = require('./lib');

async function findDuplicateGroups() {
  return ProductCatalog.aggregate([
    { $match: { identityKey: { $nin: [null, '', '|'] } } },
    { $group: { _id: '$identityKey', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
  ]);
}

async function run({ apply = false, log = () => {} } = {}) {
  // Duplicates are grouped by identity key, which is built from the Arabic
  // name - an item without one would group wrongly.
  const catalogItemsWithoutNameAr = await requireArabicNames(mongoose.connection.db, { apply, log });
  const groups = await findDuplicateGroups();
  const report = { catalogItemsWithoutNameAr, groups: groups.length, autoMerged: [], sentToReview: [], identityIndex: null };

  for (const group of groups) {
    const ids = group.ids.map(String).sort(); // ObjectId hex sorts by creation time
    const [survivorId, ...loserIds] = ids;
    const analysis = await analyzeGroup(ids);

    if (analysis.safe) {
      report.autoMerged.push({ identityKey: group._id, survivorId, merged: loserIds });
      if (apply) {
        await runInTransaction((session) => mergeCatalogItems({ survivorId, loserIds }, session));
      }
      continue;
    }

    report.sentToReview.push({ identityKey: group._id, catalogItemIds: ids, reasons: analysis.reasons });
    if (apply) {
      await CatalogDuplicateReview.findOneAndUpdate(
        { identityKey: group._id, status: 'open' },
        { $set: { catalogItemIds: ids, reasons: analysis.reasons } },
        { upsert: true }
      );
    }
  }

  // The unique index, once nothing blocks it.
  const remaining = apply ? await findDuplicateGroups() : groups.filter((g) =>
    report.sentToReview.some((r) => r.identityKey === g._id)
  );
  const indexes = await ProductCatalog.collection.indexes().catch(() => []);
  const indexExists = indexes.some((index) => index.name === 'identityKey_1' && index.unique);
  if (indexExists) {
    report.identityIndex = 'already exists';
  } else if (remaining.length > 0) {
    report.identityIndex = `blocked by ${remaining.length} duplicate group(s) awaiting admin review`;
    for (const group of remaining) log(`  blocking: ${group._id} (${group.count} items)`);
  } else if (apply) {
    await ProductCatalog.collection.createIndex({ identityKey: 1 }, { unique: true, name: 'identityKey_1' });
    report.identityIndex = 'created';
  } else {
    report.identityIndex = 'would be created';
  }

  log(
    `${groups.length} duplicate group(s): ${report.autoMerged.length} ${apply ? 'merged' : 'to merge'} automatically, ` +
      `${report.sentToReview.length} ${apply ? 'sent' : 'to send'} to admin review. identityKey index: ${report.identityIndex}.`
  );
  return report;
}

module.exports = { run, findDuplicateGroups };

if (require.main === module) {
  runCli('04-dedupe-catalog', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
