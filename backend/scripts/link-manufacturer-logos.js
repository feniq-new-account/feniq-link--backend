// Gives the pharmaceutical companies their logos, in bulk.
//
// The pack (data/manufacturer-logos) is a folder with
//   manifest.json  - [{ manufacturerAr, file, source }]
//   images/<file>  - one square logo per company, named after its content
// Each row is matched to a Manufacturer by its key (the normalized name, the
// same key the catalog import and the admin's rename use), the logo is stored
// and `logoUrl` set to its public address. Stored in MEDIA_DIR/manufacturers/
// when MEDIA_DIR is set (in-country server), on Cloudinary otherwise
// (feniq/manufacturers/<file name>, so a re-run reuses the same picture).
//
// A company that already has a logo is left alone (an admin's upload wins)
// unless --overwrite is given. A company that is not in the database is
// reported and skipped - this never creates one. Nothing is written with
// --dry-run.
//
// Usage:
//   node scripts/link-manufacturer-logos.js <packDir> [--dry-run] [--overwrite]
//   (needs MEDIA_DIR + MEDIA_PUBLIC_URL or the CLOUDINARY_* keys, like link-catalog-images.js)
require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Manufacturer = require('../src/models/manufacturer.model');
const { normalizeText } = require('../src/utils/normalizeText');
const mediaStorage = require('../src/services/mediaStorage.service');

const CLOUDINARY_FOLDER = 'feniq/manufacturers';

function cloudinaryConfigured() {
  const c = env.cloudinary || {};
  return Boolean(c.cloudName && c.apiKey && c.apiSecret);
}

// Where the logos go: { save(buffer, file) -> url, previewUrl(file) }.
function defaultStore() {
  if (mediaStorage.isEnabled()) {
    return {
      save: (buffer) => mediaStorage.saveImage(buffer, 'manufacturers'),
      previewUrl: (file) => `${env.media.publicUrl}/manufacturers/${file}`,
    };
  }
  if (cloudinaryConfigured()) {
    const cloudinary = require('../src/config/cloudinary');
    // The pack's file names are content hashes, so the name is the public_id: a
    // re-run finds the logo already there instead of uploading a copy.
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

async function linkLogos(packDir, { dryRun = false, overwrite = false, store = defaultStore() } = {}) {
  if (!store) {
    throw new Error(
      'Set MEDIA_DIR and MEDIA_PUBLIC_URL (or the CLOUDINARY_* keys) first - that is where the logos are copied to and served from.'
    );
  }
  const manifest = JSON.parse(await fs.readFile(path.join(packDir, 'manifest.json'), 'utf8'));
  const report = { rows: manifest.length, linked: 0, alreadyHadLogo: 0, changedDuringRun: 0, notInDatabase: [], missingFile: [], failed: 0 };

  // Validate the entire pack before the first upload or database write. Even a
  // missing image for an unknown company means the pack is incomplete.
  const buffers = new Map();
  for (const row of manifest) {
    const file = path.basename(row.file);
    if (buffers.has(file)) continue;
    try {
      buffers.set(file, await fs.readFile(path.join(packDir, 'images', file)));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      report.missingFile.push(row.file);
    }
  }
  if (report.missingFile.length > 0) return report;

  for (const row of manifest) {
    // `aliases`: other spellings of the same company as the database has it
    // ("ابن حيان فارما" for "ابن حيان"). The first one that exists wins.
    const keys = [row.manufacturerAr, ...(row.aliases || [])].map((name) => normalizeText(name));
    const manufacturer = await Manufacturer.findOne({ key: { $in: keys } }).select('logoUrl').lean();
    if (!manufacturer) {
      report.notInDatabase.push(row.manufacturerAr);
      continue;
    }
    if (manufacturer.logoUrl && !overwrite) {
      report.alreadyHadLogo += 1;
      continue;
    }
    const file = path.basename(row.file);
    const buffer = buffers.get(file);
    try {
      const url = dryRun ? store.previewUrl(file) : await store.save(buffer, file);
      if (!dryRun) {
        // Compare-and-set: an admin's upload between findOne and upload must
        // still win. Explicit overwrite is the only exception.
        const filter = { _id: manufacturer._id };
        if (!overwrite) filter.$or = [{ logoUrl: null }, { logoUrl: '' }];
        const result = await Manufacturer.updateOne(filter, { $set: { logoUrl: url } });
        if (result.matchedCount === 0) {
          report.changedDuringRun += 1;
          continue;
        }
        if (result.modifiedCount === 0) {
          report.alreadyHadLogo += 1;
          continue;
        }
      }
      report.linked += 1;
    } catch (err) {
      report.failed += 1;
      console.error(`Could not store ${file}:`, err.message);
    }
  }
  return report;
}

async function main() {
  const [packDir, ...flags] = process.argv.slice(2);
  if (!packDir) {
    console.error('Usage: node scripts/link-manufacturer-logos.js <packDir> [--dry-run] [--overwrite]');
    process.exitCode = 1;
    return;
  }
  const dryRun = flags.includes('--dry-run');
  await mongoose.connect(env.mongodbUri);
  try {
    const report = await linkLogos(packDir, { dryRun, overwrite: flags.includes('--overwrite') });
    console.log(
      `${dryRun ? '[dry run] ' : ''}rows ${report.rows} | linked ${report.linked} | already had a logo ${report.alreadyHadLogo} | changed during run ${report.changedDuringRun} | not in the database ${report.notInDatabase.length} | missing file ${report.missingFile.length} | failed ${report.failed}`
    );
    if (report.notInDatabase.length > 0) console.log('Not in the database:', report.notInDatabase.join(' ; '));
    if (report.missingFile.length > 0) console.error('Incomplete pack; no logos were written. Missing files:', report.missingFile.join(' ; '));
    // The companies the app still draws as a letter, so a missing spelling can
    // be added to the pack as an alias.
    const bare = await Manufacturer.find({ $or: [{ logoUrl: null }, { logoUrl: '' }] }).select('nameAr nameEn').sort({ nameAr: 1 }).lean();
    console.log(`Still without a logo (${bare.length}):`, bare.map((m) => (m.nameEn ? `${m.nameAr} | ${m.nameEn}` : m.nameAr)).join(' ; '));
    if (report.failed > 0 || report.missingFile.length > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { linkLogos };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

