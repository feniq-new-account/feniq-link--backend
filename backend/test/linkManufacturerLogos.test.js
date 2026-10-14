// Bulk logos for the pharmaceutical companies (scripts/link-manufacturer-logos.js).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-manufacturer-logos-0000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const Manufacturer = require('../src/models/manufacturer.model');
const { linkLogos } = require('../scripts/link-manufacturer-logos');

// Fake store: remembers what it was asked to save, and returns a stable address per file.
function fakeStore() {
  const saved = [];
  return {
    saved,
    save: async (buffer, file) => {
      saved.push(file);
      return `https://cdn.example/manufacturers/${file}`;
    },
    previewUrl: (file) => `preview:${file}`,
  };
}

let packDir;
const manifest = [
  { manufacturerAr: 'آسيا', file: 'aaaa.webp' },
  { manufacturerAr: 'ابن الهيثم', file: 'bbbb.webp' },
  { manufacturerAr: 'شركة مجهولة', file: 'aaaa.webp' },
  { manufacturerAr: 'بحري', file: 'aaaa.webp' },
];

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-manufacturer-logos-test' });
  await syncIndexes(Manufacturer);
  packDir = await fs.mkdtemp(path.join(os.tmpdir(), 'feniq-logos-'));
  await fs.mkdir(path.join(packDir, 'images'));
  await fs.writeFile(path.join(packDir, 'images', 'aaaa.webp'), 'logo-a');
  await fs.writeFile(path.join(packDir, 'images', 'bbbb.webp'), 'logo-b');
  await fs.writeFile(
    path.join(packDir, 'manifest.json'),
    JSON.stringify([
      { manufacturerAr: 'آسيا', file: 'aaaa.webp', source: 'https://asia.example' },
      { manufacturerAr: 'ابن الهيثم', file: 'bbbb.webp', source: 'https://haytham.example' },
      { manufacturerAr: 'شركة مجهولة', file: 'aaaa.webp', source: 'https://nobody.example' },
      { manufacturerAr: 'بحري', file: 'gone.webp', source: 'https://bahri.example' },
    ])
  );
});

test.after(async () => {
  await fs.rm(packDir, { recursive: true, force: true });
  await stopMemoryMongo();
});

test.beforeEach(async () => {
  await fs.writeFile(path.join(packDir, 'manifest.json'), JSON.stringify(manifest));
  await Manufacturer.deleteMany({});
  await Manufacturer.create([
    // A spelling variant (hamza) of the name in the pack still finds the company.
    { nameAr: 'اسيا' },
    { nameAr: 'ابن الهيثم', logoUrl: 'https://res.cloudinary.com/x/image/upload/admin-upload.png' },
    { nameAr: 'بحري' },
  ]);
});

test('a company without a logo gets it, found through the normalized name', async () => {
  const store = fakeStore();
  const report = await linkLogos(packDir, { store });

  assert.strictEqual((await Manufacturer.findOne({ nameAr: 'اسيا' }).lean()).logoUrl, 'https://cdn.example/manufacturers/aaaa.webp');
  assert.strictEqual(report.linked, 2);
});

test("an admin's logo is never replaced unless asked", async () => {
  const kept = await linkLogos(packDir, { store: fakeStore() });
  assert.strictEqual(kept.alreadyHadLogo, 1);
  assert.strictEqual(
    (await Manufacturer.findOne({ nameAr: 'ابن الهيثم' }).lean()).logoUrl,
    'https://res.cloudinary.com/x/image/upload/admin-upload.png'
  );

  const replaced = await linkLogos(packDir, { store: fakeStore(), overwrite: true });
  assert.strictEqual(replaced.alreadyHadLogo, 0);
  assert.strictEqual((await Manufacturer.findOne({ nameAr: 'ابن الهيثم' }).lean()).logoUrl, 'https://cdn.example/manufacturers/bbbb.webp');
});

test('an unknown company is reported and not created', async () => {
  const report = await linkLogos(packDir, { store: fakeStore() });

  assert.deepStrictEqual(report.notInDatabase, ['شركة مجهولة']);
  assert.deepStrictEqual(report.missingFile, []);
  assert.strictEqual(await Manufacturer.countDocuments(), 3);
});

test('a dry run writes nothing and stores nothing', async () => {
  const store = fakeStore();
  const report = await linkLogos(packDir, { store, dryRun: true });

  assert.strictEqual(report.linked, 2);
  assert.deepStrictEqual(store.saved, []);
  assert.strictEqual((await Manufacturer.findOne({ nameAr: 'اسيا' }).lean()).logoUrl, null);
});

test('without anywhere to store the logos it refuses to run', async () => {
  await assert.rejects(linkLogos(packDir, { store: null }), /MEDIA_DIR/);
});

test('an incomplete pack aborts before any upload or database write, including dry run', async () => {
  await fs.writeFile(path.join(packDir, 'manifest.json'), JSON.stringify([
    ...manifest,
    { manufacturerAr: 'شركة مجهولة أخرى', file: 'gone.webp' },
  ]));
  for (const dryRun of [false, true]) {
    const store = fakeStore();
    const report = await linkLogos(packDir, { store, dryRun });
    assert.deepStrictEqual(report.missingFile, ['gone.webp']);
    assert.strictEqual(report.linked, 0);
    assert.deepStrictEqual(store.saved, []);
    assert.strictEqual((await Manufacturer.findOne({ nameAr: 'اسيا' }).lean()).logoUrl, null);
  }
});

test('an admin upload during storage wins when overwrite is false', async () => {
  const store = fakeStore();
  const save = store.save;
  store.save = async (buffer, file) => {
    if (file === 'aaaa.webp') {
      await Manufacturer.updateOne({ nameAr: 'اسيا' }, { $set: { logoUrl: 'https://cdn.example/admin-new.webp' } });
    }
    return save(buffer, file);
  };
  const report = await linkLogos(packDir, { store });
  assert.strictEqual((await Manufacturer.findOne({ nameAr: 'اسيا' }).lean()).logoUrl, 'https://cdn.example/admin-new.webp');
  assert.strictEqual(report.changedDuringRun, 1);
  assert.strictEqual(report.linked, 1);
});

test('a company deleted during storage is not recreated or counted as linked', async () => {
  const store = fakeStore();
  const save = store.save;
  store.save = async (buffer, file) => {
    await Manufacturer.deleteOne({ nameAr: 'اسيا' });
    return save(buffer, file);
  };
  const report = await linkLogos(packDir, { store });
  assert.strictEqual(await Manufacturer.countDocuments({ nameAr: 'اسيا' }), 0);
  assert.strictEqual(report.changedDuringRun, 1);
  assert.strictEqual(report.linked, 1);
});

