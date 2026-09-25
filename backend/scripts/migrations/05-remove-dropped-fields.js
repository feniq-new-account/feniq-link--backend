// Migration 05 - remove fields the models no longer have (catalog overhaul).
//
//  - Product.barcode (§1.6.4, L7): reserved "for a later stage", never written
//    by any UI, gone from the model and every code path.
//  - ProductCatalog.priceUsd: the central catalog has no price - a price
//    belongs only to a warehouse's own product (Product.price). It was set by
//    the old catalog import and by catalog-request approval; nothing reads it.
//
// Unsets them on the documents that still carry them. Idempotent.
//
// Usage: node scripts/migrations/05-remove-dropped-fields.js [--apply]
const mongoose = require('mongoose');
const { runCli } = require('./lib');

const DROPPED = [
  { collection: 'products', field: 'barcode', reportKey: 'productsWithBarcode', updatedKey: 'productsUpdated' },
  { collection: 'productcatalogs', field: 'priceUsd', reportKey: 'catalogItemsWithPrice', updatedKey: 'catalogItemsUpdated' },
];

async function run({ apply = false, log = () => {} } = {}) {
  const db = mongoose.connection.db;
  const report = {};
  for (const { collection, field, reportKey, updatedKey } of DROPPED) {
    const filter = { [field]: { $exists: true } };
    report[reportKey] = await db.collection(collection).countDocuments(filter);
    if (apply && report[reportKey] > 0) {
      const result = await db.collection(collection).updateMany(filter, { $unset: { [field]: '' } });
      report[updatedKey] = result.modifiedCount;
    }
    log(`${report[reportKey]} ${collection} document(s) ${apply ? 'cleaned of' : 'still carry'} ${field}.`);
  }
  return report;
}

module.exports = { run };

if (require.main === module) {
  runCli('05-remove-dropped-fields', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
