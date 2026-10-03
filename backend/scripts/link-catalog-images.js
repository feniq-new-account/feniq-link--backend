// Links a folder of medicine pictures to the central catalog, in bulk.
//
// The pack (tools/catalog-images builds one) is a folder with
//   manifest.json  - [{ nameAr, manufacturerAr, file, confidence, sourcePage, ... }]
//   images/<file>  - the pictures, named after their content
// Each manifest row is matched to a catalog item by its identity (the normalized
// name + manufacturer, the same key the catalog import uses), the picture is
// copied into MEDIA_DIR/catalog/ and the item's imageUrl set to its public address.
//
// An item that already has a picture is left alone (an admin's upload wins)
// unless --overwrite is given. Nothing is written with --dry-run.
//
// Usage:
//   MEDIA_DIR=/var/lib/feniq/media MEDIA_PUBLIC_URL=https://api.example.sy/media \
//     node scripts/link-catalog-images.js <packDir> [--dry-run] [--overwrite]
require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const ProductCatalog = require('../src/models/productCatalog.model');
const { searchKey, identityKeyOf } = require('../src/models/productCatalog.model');
const mediaStorage = require('../src/services/mediaStorage.service');

const CHUNK = 500;

async function linkImages(packDir, { dryRun = false, overwrite = false } = {}) {
  if (!mediaStorage.isEnabled()) {
    throw new Error('Set MEDIA_DIR and MEDIA_PUBLIC_URL first - that is where the pictures are copied to and served from.');
  }
  const manifest = JSON.parse(await fs.readFile(path.join(packDir, 'manifest.json'), 'utf8'));
  const report = { rows: manifest.length, linked: 0, alreadyHadImage: 0, notInCatalog: [], missingFile: [], failed: 0 };

  for (let start = 0; start < manifest.length; start += CHUNK) {
    const rows = manifest.slice(start, start + CHUNK);
    const keyed = rows.map((row) => ({ row, key: identityKeyOf(searchKey(row.nameAr), searchKey(row.manufacturerAr)) }));
    const items = await ProductCatalog.find({ identityKey: { $in: keyed.map((k) => k.key) } })
      .select('identityKey imageUrl')
      .lean();
    const byKey = new Map(items.map((item) => [item.identityKey, item]));

    const operations = [];
    for (const { row, key } of keyed) {
      const item = byKey.get(key);
      if (!item) {
        report.notInCatalog.push(row.nameAr);
        continue;
      }
      if (item.imageUrl && !overwrite) {
        report.alreadyHadImage += 1;
        continue;
      }
      let buffer;
      try {
        buffer = await fs.readFile(path.join(packDir, 'images', path.basename(row.file)));
      } catch {
        report.missingFile.push(row.file);
        continue;
      }
      try {
        const url = dryRun ? `${env.media.publicUrl}/catalog/${row.file}` : await mediaStorage.saveImage(buffer, 'catalog');
        operations.push({
          updateOne: {
            filter: { _id: item._id },
            update: { $set: { imageUrl: url, imageSourceUrl: row.sourcePage ?? null, imageMatch: row.confidence ?? null } },
          },
        });
      } catch {
        report.failed += 1;
      }
    }
    if (operations.length > 0) {
      if (!dryRun) await ProductCatalog.bulkWrite(operations, { ordered: false });
      report.linked += operations.length;
    }
  }
  return report;
}

async function main() {
  const [packDir, ...flags] = process.argv.slice(2);
  if (!packDir) {
    console.error('Usage: node scripts/link-catalog-images.js <packDir> [--dry-run] [--overwrite]');
    process.exitCode = 1;
    return;
  }
  await mongoose.connect(env.mongodbUri);
  try {
    const report = await linkImages(packDir, { dryRun: flags.includes('--dry-run'), overwrite: flags.includes('--overwrite') });
    console.log(
      `${flags.includes('--dry-run') ? '[dry run] ' : ''}rows ${report.rows} | linked ${report.linked} | already had a picture ${report.alreadyHadImage} | not in catalog ${report.notInCatalog.length} | missing file ${report.missingFile.length} | failed ${report.failed}`
    );
    if (report.notInCatalog.length > 0) console.log('Not in the catalog (first 15):', report.notInCatalog.slice(0, 15).join(' ; '));
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { linkImages };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
