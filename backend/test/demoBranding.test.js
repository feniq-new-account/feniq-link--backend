// The designed demo branding: new logos, designed warehouse banners and two
// Feniq banners, applied once and re-applied only on a version bump.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feniq-demo-branding-'));
process.env.MEDIA_DIR = mediaDir;
process.env.MEDIA_PUBLIC_URL = 'https://media.test/media';

const test = require('node:test');
const assert = require('node:assert');

const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const Warehouse = require('../src/models/warehouse.model');
const Banner = require('../src/models/banner.model');
const { seedDemoAdminIfNone, seedDemoDataIfEmpty } = require('../src/services/demoSeed.service');
const { seedDemoCatalogImages } = require('../src/services/demoCatalogImages.service');
const { seedDemoFeatures } = require('../src/services/demoFeatures.service');
const { applyDemoBranding, FENIQ_BANNERS, WAREHOUSE_BANNER_TITLES } = require('../src/services/demoBranding.service');

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-demo-branding-test' });
});

test.after(async () => {
  await stopMemoryMongo();
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

test('does nothing without demo warehouses', async () => {
  assert.strictEqual(await applyDemoBranding(), null);
});

test('replaces logos and banners once, and adds the Feniq banners', async () => {
  await seedDemoAdminIfNone();
  await seedDemoDataIfEmpty();
  await seedDemoCatalogImages();
  await seedDemoFeatures();
  // A deployment seeded before the redesign still has its old logos.
  await Warehouse.updateMany({}, { $set: { logo: 'https://media.test/media/warehouses/old.png' } });

  const result = await applyDemoBranding();
  assert.deepStrictEqual(result, { logos: 3, banners: 3, feniqBanners: FENIQ_BANNERS.length });

  const warehouses = await Warehouse.find().select('logo').lean();
  for (const w of warehouses) {
    assert.ok(w.logo.startsWith('https://media.test/media/warehouses/'));
    assert.notStrictEqual(w.logo, 'https://media.test/media/warehouses/old.png');
  }
  const banners = await Banner.find({ warehouseId: { $ne: null } }).lean();
  assert.strictEqual(banners.length, 3);
  for (const b of banners) {
    assert.ok(Object.values(WAREHOUSE_BANNER_TITLES).includes(b.title));
    assert.ok(b.endDate > new Date(Date.now() + 50 * 24 * 60 * 60 * 1000));
  }
  const feniq = await Banner.find({ warehouseId: null }).lean();
  assert.deepStrictEqual(feniq.map((b) => b.title).sort(), FENIQ_BANNERS.map((b) => b.title).sort());
  assert.ok(feniq.every((b) => b.status === 'approved' && b.imageUrl.startsWith('https://media.test/media/')));

  assert.strictEqual(await applyDemoBranding(), null, 'applied once per version');
});
