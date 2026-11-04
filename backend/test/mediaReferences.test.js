process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-media-references-00000';
process.env.NODE_ENV = 'test';
process.env.CLOUDINARY_CLOUD_NAME = 'feniq-reference-test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startMemoryMongo, stopMemoryMongo } = require('./helpers/mongo');
const env = require('../src/config/env');
const media = require('../src/services/mediaStorage.service');
const cloudinary = require('../src/config/cloudinary');
const { deleteImageByUrl } = require('../src/services/upload.service');
const Catalog = require('../src/models/productCatalog.model');
const Banner = require('../src/models/banner.model');

const destroyed = [];
const originalDestroy = cloudinary.uploader.destroy;
let mediaDir;
const cloudUrl = (asset) => `https://res.cloudinary.com/feniq-reference-test/image/upload/v12/${asset}.png`;

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-media-references-test' });
  cloudinary.uploader.destroy = async (publicId) => { destroyed.push(publicId); };
  mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'feniq-shared-media-'));
  env.media.dir = mediaDir;
  env.media.publicUrl = 'https://api.example.sy/media';
});

test.after(async () => {
  cloudinary.uploader.destroy = originalDestroy;
  env.media.dir = '';
  env.media.publicUrl = '';
  await fs.rm(mediaDir, { recursive: true, force: true });
  await stopMemoryMongo();
});

test('query aliases and Cloudinary versions cannot bypass references to the underlying asset', async () => {
  const original = cloudUrl('catalog/shared');
  const entry = await Catalog.collection.insertOne({ imageUrl: original });
  for (const alias of [original, `${original}?copied=1`, original.replace('/v12/', '/v99/')]) {
    await deleteImageByUrl(alias);
  }
  assert.deepEqual(destroyed, []);
  await Catalog.collection.deleteOne({ _id: entry.insertedId });
  await deleteImageByUrl(`${original}?copied=1`);
  assert.deepEqual(destroyed, ['catalog/shared']);
});

test('cleanup preserves media referenced by every supported record type', async () => {
  const fields = [
    ['productCatalog', 'imageUrl'], ['product', 'image'], ['manufacturer', 'logoUrl'],
    ['banner', 'imageUrl'], ['advertisement', 'imageUrl'], ['return', 'images'],
    ['warehouse', 'logo'], ['pharmacy', 'verificationPhoto'], ['order', 'deliverySealPhoto'],
  ];
  for (const [modelName, field] of fields) {
    const model = require(`../src/models/${modelName}.model`);
    const url = cloudUrl(`shared/${modelName}`);
    // Raw rows exercise real reference queries without creating unrelated
    // orders, ledger entries or accounts solely to attach a media reference.
    const row = await model.collection.insertOne({ [field]: field === 'images' ? [url] : url });
    const before = destroyed.length;
    await deleteImageByUrl(url);
    assert.equal(destroyed.length, before, `${modelName}.${field} still uses the file`);
    await model.collection.deleteOne({ _id: row.insertedId });
    await deleteImageByUrl(url);
    assert.equal(destroyed.at(-1), `shared/${modelName}`, 'unreferenced media is still cleaned up');
  }
});

test('a shared local file survives clearing one reference and is removed after the last one', async () => {
  const buffer = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('shared')]);
  const url = await media.saveImage(buffer, 'catalog');
  const catalog = await Catalog.collection.insertOne({ imageUrl: url });
  const banner = await Banner.collection.insertOne({ imageUrl: `${url}?cached=1` });
  await Catalog.collection.deleteOne({ _id: catalog.insertedId });
  await deleteImageByUrl(url);
  await fs.access(media.pathForUrl(url));
  await Banner.collection.deleteOne({ _id: banner.insertedId });
  await deleteImageByUrl(url);
  await assert.rejects(fs.access(media.pathForUrl(url)), { code: 'ENOENT' });
});

test('an unrelated cloud URL never uses our delete credentials', async () => {
  const before = destroyed.length;
  await deleteImageByUrl('https://res.cloudinary.com/another-cloud/image/upload/v1/catalog/shared.png');
  await deleteImageByUrl('https://other.example/image/upload/v1/catalog/shared.png');
  assert.equal(destroyed.length, before);
});
