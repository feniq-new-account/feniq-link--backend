// Migration 03 - why each inactive product is inactive (catalog overhaul
// §1.6.2).
//
// Product.deactivatedBy records which platform action turned a product off,
// because the two are undone differently: reactivating a catalog item brings
// back its 'catalog_recall' products, never the ones an admin disabled one by
// one. For every product with isActive:false and no reason yet:
//   - its catalog item is inactive  -> 'catalog_recall'
//   - otherwise (including legacy products with no catalog item) -> 'admin'
//
// Idempotent: only rows with no deactivatedBy are touched.
//
// Usage: node scripts/migrations/03-deactivated-by.js [--apply]
const mongoose = require('mongoose');
const { runCli } = require('./lib');

async function run({ apply = false, log = () => {} } = {}) {
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const catalog = db.collection('productcatalogs');

  const inactiveItemIds = await catalog.distinct('_id', { isActive: false });
  const base = { isActive: false, $or: [{ deactivatedBy: null }, { deactivatedBy: { $exists: false } }] };
  const recallFilter = { ...base, masterProductId: { $in: inactiveItemIds } };
  const adminFilter = { ...base, masterProductId: { $nin: inactiveItemIds } };

  const report = {
    catalogRecall: await products.countDocuments(recallFilter),
    admin: await products.countDocuments(adminFilter),
  };
  if (apply) {
    await products.updateMany(recallFilter, { $set: { deactivatedBy: 'catalog_recall' } });
    await products.updateMany(adminFilter, { $set: { deactivatedBy: 'admin' } });
  }
  log(`${report.catalogRecall} product(s) -> catalog_recall, ${report.admin} -> admin${apply ? '' : ' (dry run)'}.`);
  return report;
}

module.exports = { run };

if (require.main === module) {
  runCli('03-deactivated-by', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
