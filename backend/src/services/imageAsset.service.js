const env = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { uploadImage, deleteImageByUrl } = require('./upload.service');
const { verifyImageMagicBytes } = require('../middlewares/upload.middleware');
const ProductCatalog = require('../models/productCatalog.model');
const Product = require('../models/product.model');
const Manufacturer = require('../models/manufacturer.model');

// Catalog images (catalog overhaul Phase 5.3 / Phase 9, M7): the central image
// of a catalog item, a manufacturer's logo and a warehouse's override image on
// its own product. All of them live on Cloudinary, uploaded through the
// existing upload service - never a free-text URL.

// A Cloudinary delivery URL on OUR cloud: https://res.cloudinary.com/<cloud>/...
function isOwnCloudinaryUrl(url) {
  const cloudName = env.cloudinary?.cloudName;
  if (typeof url !== 'string' || !cloudName) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === 'res.cloudinary.com' &&
    parsed.pathname.startsWith(`/${cloudName}/image/upload/`)
  );
}

// An image field sent as data (a product edit carrying `image`): null or ''
// clears it; anything else must be one of our Cloudinary URLs (400 otherwise).
// Returns undefined when the field was not sent.
function imageUrlInput(value) {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value === 'string' && isOwnCloudinaryUrl(value.trim())) return value.trim();
  throw ApiError.badRequest('Images must be uploaded - only our own image links are accepted.', undefined, 'INVALID_IMAGE_URL');
}

// Validates an uploaded file's actual bytes and stores it on Cloudinary under
// `folder`. Returns the delivery URL.
async function storeUploadedImage(file, folder) {
  if (!file) throw ApiError.badRequest('No image uploaded.', undefined, 'NO_IMAGE_FILE');
  if (!verifyImageMagicBytes(file.buffer)) {
    throw ApiError.badRequest('The file is not a JPEG, PNG or WEBP image.', undefined, 'INVALID_MEDIA_TYPE');
  }
  return uploadImage(file.buffer, folder);
}

// Deletes a replaced/cleared image - only if it is ours and nothing else still
// points at it (the same URL can be a catalog image and a product override,
// or survive a merge on another document). Best effort, never throws.
async function releaseImage(url) {
  if (!url || !isOwnCloudinaryUrl(url)) return;
  try {
    const [catalog, products, manufacturers] = await Promise.all([
      ProductCatalog.exists({ imageUrl: url }),
      Product.exists({ image: url }),
      Manufacturer.exists({ logoUrl: url }),
    ]);
    if (catalog || products || manufacturers) return;
    await deleteImageByUrl(url);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Image release failed:', err.message);
  }
}

module.exports = { isOwnCloudinaryUrl, imageUrlInput, storeUploadedImage, releaseImage };
