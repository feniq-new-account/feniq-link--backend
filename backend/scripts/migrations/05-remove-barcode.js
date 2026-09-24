// Migration 05 - remove Product.barcode (catalog overhaul §1.6.4, L7).
//
// The field was reserved "for a later stage", never written by any UI, and is
// gone from the model and every code path. This unsets it on the documents that
// still carry it. Idempotent.
//
// Usage: node scripts/migrations/05-remove-barcode.js [--apply]
const mongoose = require('mongoose');
const { runCli } = require('./lib');

async function run({ apply = false, log = () => {} } = {}) {
  const products = mongoose.connection.db.collection('products');
  const filter = { barcode: { $exists: true } };
  const report = { productsWithBarcode: await products.countDocuments(filter) };
  if (apply && report.productsWithBarcode > 0) {
    const result = await products.updateMany(filter, { $unset: { barcode: '' } });
    report.productsUpdated = result.modifiedCount;
  }
  log(`${report.productsWithBarcode} product(s) ${apply ? 'cleaned' : 'still carry a barcode field'}.`);
  return report;
}

module.exports = { run };

if (require.main === module) {
  runCli('05-remove-barcode', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
