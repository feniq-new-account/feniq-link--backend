// Pictures kept on the server's own disk (services/mediaStorage.service.js) and the
// bulk linking of a picture pack to the catalog (scripts/link-catalog-images.js).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-media-tests-padding!';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const env = require('../src/config/env');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const media = require('../src/services/mediaStorage.service');
const { imageUrlInput, releaseImage } = require('../src/services/imageAsset.service');
const { setCatalogImage } = require('../src/services/productCatalog.service');
const { linkImages } = require('../scripts/link-catalog-images');

// Smallest buffers the sniffing accepts.
const webp = (tag) => Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from(tag)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('....')]);

let mediaDir;
let packDir;

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-media-test' });
  await syncIndexes(ProductCatalog, Manufacturer);
  mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'feniq-media-'));
  packDir = await fs.mkdtemp(path.join(os.tmpdir(), 'feniq-pack-'));
  env.media.dir = mediaDir;
  env.media.publicUrl = 'https://api.example.sy/media';
});

test.after(async () => {
  env.media.dir = '';
  env.media.publicUrl = '';
  await fs.rm(mediaDir, { recursive: true, force: true });
  await fs.rm(packDir, { recursive: true, force: true });
  await stopMemoryMongo();
});

test('an image is saved under its content hash and served at the public address', async () => {
  const url = await media.saveImage(webp('one'), 'catalog');
  assert.match(url, /^https:\/\/api\.example\.sy\/media\/catalog\/[0-9a-f]{16}\.webp$/);
  assert.deepStrictEqual(await fs.readFile(media.pathForUrl(url)), webp('one'));
  // The same picture again is the same file.
  assert.strictEqual(await media.saveImage(webp('one'), 'catalog'), url);
  assert.notStrictEqual(await media.saveImage(webp('two'), 'catalog'), url);
  assert.match(await media.saveImage(png, 'products'), /\/products\/[0-9a-f]{16}\.png$/);
});

test('only JPEG, PNG and WEBP bytes are stored', async () => {
  await assert.rejects(media.saveImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'catalog'));
  await assert.rejects(media.saveImage(Buffer.from('not an image at all'), 'catalog'));
});

test('a URL that is not ours, or leaves the media folder, points at no file', async () => {
  assert.strictEqual(media.pathForUrl('https://elsewhere.example/media/catalog/a.webp'), null);
  assert.strictEqual(media.pathForUrl('https://api.example.sy/media/../../etc/passwd'), null);
  assert.strictEqual(media.pathForUrl('https://api.example.sy/media/%2e%2e/%2e%2e/etc/passwd'), null);
});

test('our own media URLs are accepted as an image field, others are not', () => {
  const ours = 'https://api.example.sy/media/catalog/abc.webp';
  assert.strictEqual(imageUrlInput(ours), ours);
  assert.throws(() => imageUrlInput('https://elsewhere.example/x.webp'), { statusCode: 400 });
});

test('releasing a picture nothing uses deletes the file; one still in use stays', async () => {
  const url = await media.saveImage(webp('release'), 'catalog');
  const manufacturerAr = 'مصنع الوسائط';
  await ProductCatalog.create({ nameAr: 'دواء الوسائط', manufacturerAr, imageUrl: url });
  await releaseImage(url);
  await fs.access(media.pathForUrl(url));
  await ProductCatalog.deleteMany({ nameAr: 'دواء الوسائط' });
  await releaseImage(url);
  await assert.rejects(fs.access(media.pathForUrl(url)));
});

test('the pack is linked by catalog identity; existing pictures are kept; unknown items are reported', async () => {
  await Manufacturer.deleteMany({});
  await ProductCatalog.deleteMany({});
  await ProductCatalog.create([
    { nameAr: 'BARKATRIM TAB. (20 TAB)', manufacturerAr: 'بركات' },
    { nameAr: 'LEVOXEN-500 CTD TAB. (10 TAB)', manufacturerAr: 'بحري' },
    { nameAr: 'HAS ONE (10 TAB)', manufacturerAr: 'بحري', imageUrl: 'https://api.example.sy/media/catalog/admin-upload.webp' },
  ]);
  await fs.mkdir(path.join(packDir, 'images'), { recursive: true });
  await fs.writeFile(path.join(packDir, 'images', 'a.webp'), webp('a'));
  await fs.writeFile(path.join(packDir, 'images', 'b.webp'), webp('b'));
  const manifest = [
    // Spelling variants of the same name still meet (the catalog keys are normalized).
    { nameAr: 'barkatrim  tab. (20 tab)', manufacturerAr: 'بركات', file: 'a.webp', confidence: 'exact', sourcePage: 'https://barakat-pharma.com/p' },
    { nameAr: 'LEVOXEN-500 CTD TAB. (10 TAB)', manufacturerAr: 'بحري', file: 'b.webp', confidence: 'brand', sourcePage: 'https://bahripharm.com/p' },
    { nameAr: 'HAS ONE (10 TAB)', manufacturerAr: 'بحري', file: 'a.webp', confidence: 'exact' },
    { nameAr: 'NOT IN CATALOG (10 TAB)', manufacturerAr: 'بحري', file: 'a.webp', confidence: 'exact' },
    { nameAr: 'LEVOXEN-500 CTD TAB. (10 TAB)', manufacturerAr: 'بحري', file: 'gone.webp', confidence: 'exact' },
  ];
  await fs.writeFile(path.join(packDir, 'manifest.json'), JSON.stringify(manifest));

  const dry = await linkImages(packDir, { dryRun: true });
  assert.strictEqual(dry.linked, 2);
  assert.strictEqual((await ProductCatalog.find({ imageMatch: { $ne: null } })).length, 0, 'a dry run writes nothing');

  const report = await linkImages(packDir);
  assert.strictEqual(report.rows, 5);
  assert.strictEqual(report.alreadyHadImage, 1);
  assert.deepStrictEqual(report.notInCatalog, ['NOT IN CATALOG (10 TAB)']);
  assert.deepStrictEqual(report.missingFile, ['gone.webp']);

  const barkatrim = await ProductCatalog.findOne({ nameAr: 'BARKATRIM TAB. (20 TAB)' }).lean();
  assert.match(barkatrim.imageUrl, /^https:\/\/api\.example\.sy\/media\/catalog\/[0-9a-f]{16}\.webp$/);
  assert.strictEqual(barkatrim.imageMatch, 'exact');
  assert.strictEqual(barkatrim.imageSourceUrl, 'https://barakat-pharma.com/p');
  await fs.access(media.pathForUrl(barkatrim.imageUrl));
  const kept = await ProductCatalog.findOne({ nameAr: 'HAS ONE (10 TAB)' }).lean();
  assert.strictEqual(kept.imageUrl, 'https://api.example.sy/media/catalog/admin-upload.webp');
  assert.strictEqual(kept.imageMatch, null);

  // An admin replacing a linked picture clears where it came from.
  const levoxen = await ProductCatalog.findOne({ nameAr: 'LEVOXEN-500 CTD TAB. (10 TAB)' });
  assert.strictEqual(levoxen.imageMatch, 'brand');
  const { item } = await setCatalogImage(levoxen._id, 'https://api.example.sy/media/catalog/new.webp');
  assert.strictEqual(item.imageMatch, null);
  assert.strictEqual(item.imageSourceUrl, null);
});

test('without MEDIA_DIR the linking refuses to run', async () => {
  const saved = { ...env.media };
  env.media.dir = '';
  await assert.rejects(linkImages(packDir), /MEDIA_DIR/);
  Object.assign(env.media, saved);
});

test('the app serves the stored pictures, cacheable and embeddable from the web panel', async () => {
  const url = await media.saveImage(webp('served'), 'catalog');
  const app = require('../src/app');
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + new URL(url).pathname);
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(Buffer.from(await response.arrayBuffer()), webp('served'));
    assert.match(response.headers.get('cache-control'), /max-age=31536000/);
    assert.strictEqual(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.strictEqual((await fetch(`${base}/media/catalog/0000000000000000.webp`)).status, 404);
    assert.strictEqual((await fetch(`${base}/media/..%2f..%2fetc%2fpasswd`)).status >= 400, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
