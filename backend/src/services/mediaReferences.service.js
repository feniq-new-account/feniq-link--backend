const env = require('../config/env');
const mediaStorage = require('./mediaStorage.service');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Match the underlying stored asset rather than one spelling of its delivery
// URL: query strings, fragments and Cloudinary versions do not change the
// public_id passed to destroy(). Only assets on our configured storage qualify.
function mediaReferencePattern(url) {
  if (typeof url !== 'string') return null;
  if (mediaStorage.isOwnMediaUrl(url)) {
    if (!mediaStorage.pathForUrl(url)) return null;
    const canonical = url.split(/[?#]/, 1)[0];
    return new RegExp(`^${escapeRegex(canonical)}(?:[?#].*)?$`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const cloud = env.cloudinary?.cloudName;
  if (!cloud || parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return null;
  const prefix = `/${cloud}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  const match = parsed.pathname.slice(prefix.length).match(/^(image|video)\/upload\/(?:v\d+\/)?(.+)\.[^/.]+$/);
  if (!match) return null;
  const [, type, publicId] = match;
  return new RegExp(
    `^https://res\\.cloudinary\\.com/${escapeRegex(cloud)}/${type}/upload/(?:v\\d+/)?${escapeRegex(publicId)}\\.[^/?#]+(?:[?#].*)?$`
  );
}

async function hasMediaReferences(url) {
  const pattern = mediaReferencePattern(url);
  // An unknown asset must never be deleted using our provider credentials.
  if (!pattern) return true;
  // Lazy imports keep the upload helper usable without a model dependency
  // cycle. Every field storing an uploaded media URL participates, including
  // content-hashed files shared across different kinds of records.
  const fields = [
    ['productCatalog', 'imageUrl'],
    ['product', 'image'],
    ['manufacturer', 'logoUrl'],
    ['banner', 'imageUrl'],
    ['advertisement', 'imageUrl'],
    ['return', 'images'],
    ['warehouse', 'logo'],
    ['pharmacy', 'verificationPhoto'],
    ['order', 'deliverySealPhoto'],
  ];
  const references = await Promise.all(fields.map(([model, field]) =>
    require(`../models/${model}.model`).exists({ [field]: pattern })
  ));
  return references.some(Boolean);
}

module.exports = { mediaReferencePattern, hasMediaReferences };
