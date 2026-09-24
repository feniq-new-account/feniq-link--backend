// Migration 01 - manufacturer discounts and the import registry, keyed on the
// central Manufacturer (catalog overhaul §1.5, M3).
//
// Both collections were keyed on the raw name typed into an import file, so a
// spelling that differed from the catalog's by one space or one hamza made a
// discount that reached no product. For each ManufacturerDiscount and
// WarehouseManufacturer row:
//
//  - manufacturerId is back-filled from the Manufacturer its manufacturerAr
//    normalizes to, and manufacturerAr is rewritten to that Manufacturer's
//    canonical name;
//  - rows of one warehouse that now resolve to the same Manufacturer are merged
//    into one. For discounts the HIGHER percentage is kept, and every such clash
//    is reported (warehouse, both values);
//  - rows whose name matches no Manufacturer are left untouched (their
//    manufacturerId stays null) and listed in the report - never dropped.
//
// The old unique indexes on (warehouseId, manufacturerAr) are dropped first:
// they are replaced by (warehouseId, manufacturerId), and rewriting two variant
// rows to one canonical name would violate them.
//
// Runs after 00-manufacturers.js. Idempotent.
//
// Usage: node scripts/migrations/01-manufacturer-discounts.js [--apply]
const mongoose = require('mongoose');
const { normalizeText } = require('../../src/utils/normalizeText');
const { runCli, dropIndexIfExists } = require('./lib');

async function migrateCollection(collection, { apply, log, isDiscount, manufacturerByKey }) {
  const result = { linked: 0, merged: 0, unmatched: [], clashes: [] };
  const rows = await collection.find({}).toArray();

  // (warehouseId, manufacturerId) -> rows
  const groups = new Map();
  for (const row of rows) {
    const manufacturer = manufacturerByKey.get(normalizeText(row.manufacturerAr));
    if (!manufacturer) {
      if (!row.manufacturerId) {
        result.unmatched.push({ id: row._id, warehouseId: row.warehouseId, manufacturerAr: row.manufacturerAr });
      }
      continue;
    }
    const key = `${row.warehouseId}|${manufacturer._id}`;
    if (!groups.has(key)) groups.set(key, { manufacturer, rows: [] });
    groups.get(key).rows.push(row);
  }

  for (const { manufacturer, rows: groupRows } of groups.values()) {
    // Survivor: for a discount the highest percentage (ties: the oldest row);
    // for the registry simply the oldest row.
    const sorted = [...groupRows].sort((a, b) =>
      isDiscount && b.discountPercentage !== a.discountPercentage
        ? b.discountPercentage - a.discountPercentage
        : String(a._id).localeCompare(String(b._id))
    );
    const [survivor, ...others] = sorted;

    if (isDiscount && others.length > 0) {
      const values = [...new Set(groupRows.map((row) => row.discountPercentage))];
      if (values.length > 1) {
        result.clashes.push({
          warehouseId: survivor.warehouseId,
          manufacturer: manufacturer.nameAr,
          kept: survivor.discountPercentage,
          dropped: others.map((row) => row.discountPercentage),
        });
      }
    }

    const needsLink =
      String(survivor.manufacturerId) !== String(manufacturer._id) || survivor.manufacturerAr !== manufacturer.nameAr;
    if (others.length > 0) {
      result.merged += others.length;
      if (apply) await collection.deleteMany({ _id: { $in: others.map((row) => row._id) } });
    }
    if (needsLink) {
      result.linked += 1;
      if (apply) {
        await collection.updateOne(
          { _id: survivor._id },
          { $set: { manufacturerId: manufacturer._id, manufacturerAr: manufacturer.nameAr } }
        );
      }
    }
  }

  log(
    `${collection.collectionName}: ${result.linked} linked, ${result.merged} duplicate(s) merged, ` +
      `${result.unmatched.length} unmatched, ${result.clashes.length} discount clash(es).`
  );
  return result;
}

async function run({ apply = false, log = () => {} } = {}) {
  const db = mongoose.connection.db;
  const discounts = db.collection('manufacturerdiscounts');
  const registry = db.collection('warehousemanufacturers');

  const manufacturers = await db.collection('manufacturers').find({}, { projection: { key: 1, nameAr: 1 } }).toArray();
  const manufacturerByKey = new Map(manufacturers.map((m) => [m.key, m]));

  const droppedIndexes = [
    await dropIndexIfExists(discounts, 'warehouseId_1_manufacturerAr_1', { apply, log }),
    await dropIndexIfExists(registry, 'warehouseId_1_manufacturerAr_1', { apply, log }),
  ].filter(Boolean).length;

  return {
    droppedIndexes,
    discounts: await migrateCollection(discounts, { apply, log, isDiscount: true, manufacturerByKey }),
    registry: await migrateCollection(registry, { apply, log, isDiscount: false, manufacturerByKey }),
  };
}

module.exports = { run };

if (require.main === module) {
  runCli('01-manufacturer-discounts', run).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
