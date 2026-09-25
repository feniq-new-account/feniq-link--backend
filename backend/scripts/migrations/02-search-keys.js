// Migration 02 - normalized search keys (catalog overhaul §1.6.1).
//
//  - Manufacturer: enKey (the normalized English name the import matches on)
//  - ProductCatalog: nameKey, nameEnKey, manufacturerKey, manufacturerEnKey and identityKey
//    recomputed with the shared normalizer (utils/normalizeText.js). The old
//    nameKey/manufacturerKey only folded case and spaces; the new ones also
//    unify hamza/ta-marbuta/alef-maksura, strip tashkeel and read Arabic digits.
//  - Product: the denormalized copies - catalog-linked products copy their
//    item's keys (and manufacturerId, in case 00 has not run on it), legacy
//    products compute them from their own name fields.
//
// The model hooks keep all of this current for everything written from now on;
// this only fills the documents written before. Runs after 00 and 01 (the
// manufacturer key comes from the canonical manufacturerAr 00 wrote).
// Idempotent: only documents whose stored keys differ are written.
//
// Usage: node scripts/migrations/02-search-keys.js [--apply]
const mongoose = require('mongoose');
const { normalizeText } = require('../../src/utils/normalizeText');
const { identityKeyOf } = require('../../src/models/productCatalog.model');
const { runCli, bulkWriteInBatches, dropIndexIfExists, requireArabicNames } = require('./lib');

const keyOf = (value) => (typeof value === 'string' && normalizeText(value)) || null;

async function run({ apply = false, log = () => {} } = {}) {
  const db = mongoose.connection.db;
  const catalog = db.collection('productcatalogs');
  const products = db.collection('products');
  const manufacturersCollection = db.collection('manufacturers');
  // The identity key is built from the Arabic name - none may be missing.
  const catalogItemsWithoutNameAr = await requireArabicNames(db, { apply, log });

  // Manufacturers: the English key the warehouse import resolves "GSK" by.
  const manufacturerOps = [];
  for await (const manufacturer of manufacturersCollection.find({}, { projection: { nameEn: 1, enKey: 1 } })) {
    const enKey = keyOf(manufacturer.nameEn);
    if ((manufacturer.enKey ?? null) !== enKey) {
      manufacturerOps.push({ updateOne: { filter: { _id: manufacturer._id }, update: { $set: { enKey } } } });
    }
  }

  // Catalog items.
  const catalogOps = [];
  const itemKeys = new Map(); // id -> keys, for the products below
  const items = catalog.find(
    {},
    { projection: { nameAr: 1, nameEn: 1, manufacturerAr: 1, manufacturerEn: 1, manufacturerId: 1, nameKey: 1, nameEnKey: 1, manufacturerKey: 1, manufacturerEnKey: 1, identityKey: 1 } }
  );
  for await (const item of items) {
    const keys = {
      nameKey: keyOf(item.nameAr),
      nameEnKey: keyOf(item.nameEn),
      manufacturerKey: keyOf(item.manufacturerAr),
      manufacturerEnKey: keyOf(item.manufacturerEn),
    };
    keys.identityKey = identityKeyOf(keys.nameKey, keys.manufacturerKey);
    itemKeys.set(String(item._id), { ...keys, manufacturerId: item.manufacturerId ?? null });
    if (Object.entries(keys).some(([field, value]) => item[field] !== value)) {
      catalogOps.push({ updateOne: { filter: { _id: item._id }, update: { $set: keys } } });
    }
  }

  // Products.
  const productOps = [];
  const cursor = products.find(
    {},
    {
      projection: {
        masterProductId: 1,
        nameAr: 1,
        nameEn: 1,
        manufacturerAr: 1,
        manufacturerEn: 1,
        manufacturerId: 1,
        nameKey: 1,
        nameEnKey: 1,
        manufacturerKey: 1,
        manufacturerEnKey: 1,
      },
    }
  );
  for await (const product of cursor) {
    let keys;
    if (product.masterProductId) {
      const fromItem = itemKeys.get(String(product.masterProductId));
      if (!fromItem) continue; // dangling link - nothing to copy from
      keys = {
        nameKey: fromItem.nameKey,
        nameEnKey: fromItem.nameEnKey,
        manufacturerKey: fromItem.manufacturerKey,
        manufacturerEnKey: fromItem.manufacturerEnKey,
      };
      if (fromItem.manufacturerId && String(product.manufacturerId) !== String(fromItem.manufacturerId)) {
        keys.manufacturerId = fromItem.manufacturerId;
      }
    } else {
      keys = {
        nameKey: keyOf(product.nameAr),
        nameEnKey: keyOf(product.nameEn),
        manufacturerKey: keyOf(product.manufacturerAr),
        manufacturerEnKey: keyOf(product.manufacturerEn),
      };
    }
    const changed = Object.entries(keys).some(([field, value]) => String(product[field] ?? null) !== String(value ?? null));
    if (changed) productOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: keys } } });
  }

  // Items whose NEW identity collides (the duplicates 04 merges). If the unique
  // identityKey index already exists (autoIndex built it on a small database),
  // writing those keys would fail - so it is dropped here and 04 rebuilds it
  // once the duplicates are merged.
  const identityCounts = new Map();
  for (const keys of itemKeys.values()) {
    identityCounts.set(keys.identityKey, (identityCounts.get(keys.identityKey) ?? 0) + 1);
  }
  const collidingIdentities = [...identityCounts].filter(([, count]) => count > 1).length;

  const report = {
    catalogItemsWithoutNameAr,
    manufacturersToUpdate: manufacturerOps.length,
    catalogItemsToUpdate: catalogOps.length,
    productsToUpdate: productOps.length,
    collidingIdentities,
    droppedIdentityIndex: false,
  };
  if (collidingIdentities > 0) {
    report.droppedIdentityIndex = await dropIndexIfExists(catalog, 'identityKey_1', { apply, log });
  }
  if (apply) {
    report.manufacturersUpdated = await bulkWriteInBatches(manufacturersCollection, manufacturerOps, { apply });
    report.catalogItemsUpdated = await bulkWriteInBatches(catalog, catalogOps, { apply });
    report.productsUpdated = await bulkWriteInBatches(products, productOps, { apply });
  }
  log(`${catalogOps.length} catalog item(s) and ${productOps.length} product(s) ${apply ? 'updated' : 'to update'}.`);
  return report;
}

module.exports = { run };

if (require.main === module) {
  runCli('02-search-keys', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
