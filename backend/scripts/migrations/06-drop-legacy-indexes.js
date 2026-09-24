// Migration 06 - index clean-up (catalog overhaul §1.3/§1.6.5).
//
//  1. Drops the four single-field indexes on products.nameAr / nameEn /
//     manufacturerAr / manufacturerEn. They only ever served the unanchored
//     regex search on the legacy name fields; every search now runs against
//     the normalized keys (nameKey/nameEnKey/manufacturerKey/manufacturerEnKey) instead - checked
//     by grep before this was written: nothing queries those four fields any
//     more (they are still READ, as display fallbacks for legacy products,
//     which needs no index). Also drops warehouseId_1_manufacturerKey_1__id_1,
//     superseded by the covering warehouse_manufacturer_page index.
//  2. Creates every index the catalog models now declare that the database
//     does not have yet (Model.createIndexes - creates only, never drops). The
//     unique identityKey index is left to 04-dedupe-catalog.js, which only
//     builds it once no duplicates remain.
//
// Run LAST, after the new search code is deployed. Idempotent.
//
// Usage: node scripts/migrations/06-drop-legacy-indexes.js [--apply]
const mongoose = require('mongoose');
const { runCli, dropIndexIfExists } = require('./lib');

const LEGACY_PRODUCT_INDEXES = [
  'nameAr_1',
  'nameEn_1',
  'manufacturerAr_1',
  'manufacturerEn_1',
  // Declared earlier on this branch, superseded by warehouse_manufacturer_page
  // (product.model.js). Only present where that earlier code auto-built it.
  'warehouseId_1_manufacturerKey_1__id_1',
];

const MODELS_TO_INDEX = [
  'product',
  'manufacturer',
  'manufacturerDiscount',
  'warehouseManufacturer',
  'warehouseProductAlias',
  'catalogRequest',
  'importBatch',
  'importBatchRow',
  'importColumnMapping',
  'catalogDuplicateReview',
];

async function run({ apply = false, log = () => {} } = {}) {
  const products = mongoose.connection.db.collection('products');
  const dropped = [];
  for (const name of LEGACY_PRODUCT_INDEXES) {
    if (await dropIndexIfExists(products, name, { apply, log })) dropped.push(name);
  }

  const ensured = [];
  for (const name of MODELS_TO_INDEX) {
    const model = require(`../../src/models/${name}.model`);
    if (apply) await model.createIndexes();
    ensured.push(model.collection.collectionName);
  }

  // ProductCatalog: everything except the unique identityKey index.
  const ProductCatalog = require('../../src/models/productCatalog.model');
  if (apply) {
    for (const [fields, options] of ProductCatalog.schema.indexes()) {
      if (fields.identityKey) continue;
      await ProductCatalog.collection.createIndex(fields, options);
    }
  }
  ensured.push('productcatalogs (except identityKey_1)');

  log(`${dropped.length} legacy index(es) ${apply ? 'dropped' : 'to drop'}; declared indexes ${apply ? 'ensured' : 'would be ensured'} on ${ensured.length} collection(s).`);
  return { droppedLegacyIndexes: dropped, ensuredCollections: ensured };
}

module.exports = { run };

if (require.main === module) {
  runCli('06-drop-legacy-indexes', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
