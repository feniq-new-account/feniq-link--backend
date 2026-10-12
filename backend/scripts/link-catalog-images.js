// Links a folder of medicine pictures to the central catalog, in bulk.
//
// The pack (tools/catalog-images builds one) is a folder with
//   manifest.json  - [{ nameAr, manufacturerAr, file, confidence, sourcePage, ... }]
//   images/<file>  - the pictures, named after their content
// Each manifest row is matched to a catalog item by its identity (the normalized
// name + manufacturer, the same key the catalog import uses), the picture is
// stored and the item's imageUrl set to its public address. Stored in
// MEDIA_DIR/catalog/ when MEDIA_DIR is set (in-country server), on Cloudinary
// otherwise (feniq/catalog/<file name>, so a re-run reuses the same picture).
//
// An item that already has a picture is left alone (an admin's upload wins)
// unless --overwrite is given. Nothing is written with --dry-run.
// --confidence=exact,brand links only those match levels (the rest wait for review).
//
// Usage:
//   MEDIA_DIR=/var/lib/feniq/media MEDIA_PUBLIC_URL=https://api.example.sy/media \
//     node scripts/link-catalog-images.js <packDir> [--dry-run] [--overwrite] [--confidence=exact,brand]
//   CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... \
//     node scripts/link-catalog-images.js <packDir> --confidence=exact,brand
require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const ProductCatalog = require('../src/models/productCatalog.model');
const { searchKey, identityKeyOf } = require('../src/models/productCatalog.model');
const mediaStorage = require('../src/services/mediaStorage.service');

const CHUNK = 500;
const CLOUDINARY_FOLDER = 'feniq/catalog';

function cloudinaryConfigured() {
  const c = env.cloudinary || {};
  return Boolean(c.cloudName && c.apiKey && c.apiSecret);
}

// Where the pictures go: { save(buffer, file) -> url, previewUrl(file) }.
function defaultStore() {
  if (mediaStorage.isEnabled()) {
    return {
      save: (buffer) => mediaStorage.saveImage(buffer, 'catalog'),
      previewUrl: (file) => `${env.media.publicUrl}/catalog/${file}`,
    };
  }
  if (cloudinaryConfigured()) {
    const cloudinary = require('../src/config/cloudinary');
    // The pack's file names are already content hashes, so the name is the public_id:
    // the same picture shared by several pack sizes is uploaded once, and a re-run
    // finds it there instead of making a copy.
    return {
      save: (buffer, file) =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: CLOUDINARY_FOLDER, public_id: path.parse(file).name, overwrite: false, resource_type: 'image' },
            (error, result) => (error ? reject(error) : resolve(result.secure_url))
          );
          stream.end(buffer);
        }),
      previewUrl: (file) => `cloudinary:${CLOUDINARY_FOLDER}/${file}`,
    };
  }
  return null;
}

async function linkImages(packDir, { dryRun = false, overwrite = false, confidence = null, store = defaultStore() } = {}) {
  if (!store) {
    throw new Error(
      'Set MEDIA_DIR and MEDIA_PUBLIC_URL (or the CLOUDINARY_* keys) first - that is where the pictures are copied to and served from.'
    );
  }
  const all = JSON.parse(await fs.readFile(path.join(packDir, 'manifest.json'), 'utf8'));
  const manifest = confidence ? all.filter((row) => confidence.includes(row.confidence)) : all;
  const report = {
    rows: all.length,
    considered: manifest.length,
    linked: 0,
    alreadyHadImage: 0,
    notInCatalog: [],
    missingFile: [],
    failed: 0,
  };
  // One upload per picture file, however many catalog items share it.
  const savedUrls = new Map();

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
      const file = path.basename(row.file);
      let buffer;
      try {
        buffer = await fs.readFile(path.join(packDir, 'images', file));
      } catch {
        report.missingFile.push(row.file);
        continue;
      }
      try {
        let url;
        if (dryRun) {
          url = store.previewUrl(file);
        } else {
          if (!savedUrls.has(file)) savedUrls.set(file, await store.save(buffer, file));
          url = savedUrls.get(file);
        }
        operations.push({
          updateOne: {
            filter: { _id: item._id },
            update: { $set: { imageUrl: url, imageSourceUrl: row.sourcePage ?? null, imageMatch: row.confidence ?? null } },
          },
        });
      } catch (err) {
        report.failed += 1;
        if (report.failed <= 3) console.error(`Could not store ${file}:`, err.message);
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
    console.error('Usage: node scripts/link-catalog-images.js <packDir> [--dry-run] [--overwrite] [--confidence=exact,brand]');
    process.exitCode = 1;
    return;
  }
  const confidenceFlag = flags.find((flag) => flag.startsWith('--confidence='));
  const confidence = confidenceFlag
    ? confidenceFlag.slice('--confidence='.length).split(',').map((level) => level.trim()).filter(Boolean)
    : null;
  await mongoose.connect(env.mongodbUri);
  try {
    const report = await linkImages(packDir, {
      dryRun: flags.includes('--dry-run'),
      overwrite: flags.includes('--overwrite'),
      confidence,
    });
    console.log(
      `${flags.includes('--dry-run') ? '[dry run] ' : ''}rows ${report.rows} | considered ${report.considered}${confidence ? ` (${confidence.join(',')})` : ''} | linked ${report.linked} | already had a picture ${report.alreadyHadImage} | not in catalog ${report.notInCatalog.length} | missing file ${report.missingFile.length} | failed ${report.failed}`
    );
    if (report.failed > 0) process.exitCode = 1;
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
