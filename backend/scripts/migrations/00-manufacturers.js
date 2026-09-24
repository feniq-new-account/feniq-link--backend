// Migration 00 - the central Manufacturer entity (catalog overhaul §1.1b/§1.6.0).
//
// Before this, a manufacturer was only the text in ProductCatalog.manufacturerAr
// (and in a legacy product's own manufacturerAr). This creates one Manufacturer
// per distinct NORMALIZED name - so "شركة الشرق", "شركة  الشرق" and "شركه الشرق"
// become one company - and links every catalog item and product to it:
//
//  1. Drops the old unique index on the raw (nameAr, manufacturerAr) pair. It is
//     replaced by the unique identityKey index (built by 04-dedupe-catalog.js),
//     and it would otherwise block step 3 wherever two variants of a company
//     each list the same medicine.
//  2. Groups every spelling (catalog items and legacy products) by normalized
//     key. The most frequent spelling becomes the Manufacturer's nameAr (ties:
//     alphabetical, so the choice is deterministic); nameEn is the most
//     frequent English name among its catalog items.
//  3. Catalog items: manufacturerId set, manufacturerAr rewritten to the
//     canonical spelling (it is the Manufacturer's display copy from now on).
//  4. Products: catalog-linked ones copy their item's manufacturerId; legacy
//     ones (no catalog link) are linked by their own text, which is left as is.
//
// Runs before 04-dedupe-catalog.js. Idempotent: an existing Manufacturer with
// the same key is reused, and rows already pointing at the right one are
// skipped.
//
// Usage: node scripts/migrations/00-manufacturers.js [--apply]
const mongoose = require('mongoose');
const { normalizeText } = require('../../src/utils/normalizeText');
const { runCli, dropIndexIfExists, bulkWriteInBatches } = require('./lib');

async function run({ apply = false, log = () => {} } = {}) {
  const db = mongoose.connection.db;
  const catalog = db.collection('productcatalogs');
  const products = db.collection('products');
  const manufacturers = db.collection('manufacturers');

  const droppedRawIndex = await dropIndexIfExists(catalog, 'nameAr_1_manufacturerAr_1', { apply, log });

  // Every spelling and how often it is used.
  const [catalogSpellings, legacySpellings] = await Promise.all([
    catalog
      .aggregate([
        { $match: { manufacturerAr: { $nin: [null, ''] } } },
        { $group: { _id: '$manufacturerAr', count: { $sum: 1 }, en: { $push: '$manufacturerEn' } } },
      ])
      .toArray(),
    products
      .aggregate([
        { $match: { masterProductId: null, manufacturerAr: { $nin: [null, ''] } } },
        { $group: { _id: '$manufacturerAr', count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const groups = new Map(); // key -> { spellings: Map(spelling -> count), en: Map(en -> count) }
  const addSpelling = (spelling, count, enNames = []) => {
    const key = normalizeText(spelling);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { spellings: new Map(), en: new Map() });
    const group = groups.get(key);
    group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + count);
    for (const en of enNames) {
      if (en) group.en.set(en, (group.en.get(en) ?? 0) + 1);
    }
  };
  catalogSpellings.forEach((row) => addSpelling(row._id, row.count, row.en));
  legacySpellings.forEach((row) => addSpelling(row._id, row.count));

  const mostFrequent = (counts) =>
    [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  const report = {
    droppedRawIndex,
    manufacturersCreated: 0,
    manufacturersReused: 0,
    spellingVariantsMerged: [],
    catalogItemsUpdated: 0,
    productsUpdated: 0,
  };

  // key -> { id, canonical }
  const resolved = new Map();
  for (const [key, group] of groups) {
    const canonical = mostFrequent(group.spellings);
    const nameEn = mostFrequent(group.en);
    if (group.spellings.size > 1) {
      report.spellingVariantsMerged.push({ canonical, variants: [...group.spellings.keys()] });
    }
    const existing = await manufacturers.findOne({ key });
    if (existing) {
      report.manufacturersReused += 1;
      resolved.set(key, { id: existing._id, canonical: existing.nameAr });
      continue;
    }
    report.manufacturersCreated += 1;
    const id = new mongoose.Types.ObjectId();
    if (apply) {
      const now = new Date();
      await manufacturers.insertOne({
        _id: id,
        nameAr: canonical,
        nameEn,
        key,
        logoUrl: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    resolved.set(key, { id, canonical });
  }

  // Catalog items, per spelling.
  for (const [key, group] of groups) {
    const { id, canonical } = resolved.get(key);
    for (const spelling of group.spellings.keys()) {
      const filter = {
        manufacturerAr: spelling,
        $or: [{ manufacturerId: { $ne: id } }, { manufacturerAr: { $ne: canonical } }],
      };
      if (apply) {
        const result = await catalog.updateMany(filter, { $set: { manufacturerId: id, manufacturerAr: canonical } });
        report.catalogItemsUpdated += result.modifiedCount;
      } else {
        report.catalogItemsUpdated += await catalog.countDocuments(filter);
      }
    }
  }

  // Catalog-linked products copy their item's manufacturer. In a dry run the
  // items were not rewritten, so their id is derived from the mapping instead.
  const productOps = [];
  const items = catalog.find({}, { projection: { manufacturerAr: 1 } });
  for await (const item of items) {
    const target = resolved.get(normalizeText(item.manufacturerAr));
    if (!target) continue;
    productOps.push({
      updateMany: {
        filter: { masterProductId: item._id, manufacturerId: { $ne: target.id } },
        update: { $set: { manufacturerId: target.id } },
      },
    });
  }
  if (apply) {
    report.productsUpdated += await bulkWriteInBatches(products, productOps, { apply });
  } else {
    for (const op of productOps) report.productsUpdated += await products.countDocuments(op.updateMany.filter);
  }

  // Legacy products are linked by their own text.
  for (const [key, group] of groups) {
    const { id } = resolved.get(key);
    for (const spelling of group.spellings.keys()) {
      const filter = { masterProductId: null, manufacturerAr: spelling, manufacturerId: { $ne: id } };
      if (apply) {
        const result = await products.updateMany(filter, { $set: { manufacturerId: id } });
        report.productsUpdated += result.modifiedCount;
      } else {
        report.productsUpdated += await products.countDocuments(filter);
      }
    }
  }

  log(
    `${report.manufacturersCreated} manufacturer(s) ${apply ? 'created' : 'to create'}, ` +
      `${report.spellingVariantsMerged.length} with several spellings merged into one.`
  );
  return report;
}

module.exports = { run };

if (require.main === module) {
  runCli('00-manufacturers', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
