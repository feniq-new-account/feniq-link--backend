const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('../config/env');

// Images stored on the server's own disk (MEDIA_DIR), served at MEDIA_PUBLIC_URL
// (app.js mounts the folder). Used instead of Cloudinary when both are set, so a
// deployment whose licence requires everything to stay in the country keeps its
// pictures there too.
//
// Files are named after their content (sha1), so saving the same picture twice is
// one file, and a catalog image shared by several pack sizes is stored once.
// Everything reads env.media at call time, not at load.

const EXTENSIONS = { jpg: 'jpg', png: 'png', webp: 'webp' };

function isEnabled() {
  return Boolean(env.media?.dir && env.media?.publicUrl);
}

// 'jpg' | 'png' | 'webp' from the file's own bytes, or null.
function sniffExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return EXTENSIONS.jpg;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return EXTENSIONS.png;
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return EXTENSIONS.webp;
  }
  return null;
}

function safeFolder(folder) {
  const clean = String(folder || 'misc').replace(/[^a-zA-Z0-9_-]/g, '');
  return clean || 'misc';
}

// Writes the picture under <dir>/<folder>/<sha1-16>.<ext> and resolves to its
// public URL. Rejects a buffer that is not a JPEG, PNG or WEBP.
async function saveImage(buffer, folder) {
  const extension = sniffExtension(buffer);
  if (!extension) throw new Error('Not a JPEG, PNG or WEBP image.');
  const name = `${crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16)}.${extension}`;
  const dir = path.join(env.media.dir, safeFolder(folder));
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, name);
  try {
    await fs.access(target);
  } catch {
    // Written under a temporary name and renamed, so a reader never meets half a file.
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, buffer);
    await fs.rename(temporary, target);
  }
  return `${env.media.publicUrl}/${safeFolder(folder)}/${name}`;
}

function isOwnMediaUrl(url) {
  return typeof url === 'string' && isEnabled() && url.startsWith(`${env.media.publicUrl}/`);
}

// The file a media URL points at, or null when the URL is not ours or would leave
// the media folder.
function pathForUrl(url) {
  if (!isOwnMediaUrl(url)) return null;
  const relative = decodeURIComponent(url.slice(env.media.publicUrl.length + 1).split(/[?#]/)[0]);
  const root = path.resolve(env.media.dir);
  const target = path.resolve(root, relative);
  return target.startsWith(root + path.sep) ? target : null;
}

// Best effort, like the Cloudinary delete: a leftover file is not worth failing a
// user's edit over.
async function deleteByUrl(url) {
  const target = pathForUrl(url);
  if (!target) return;
  try {
    await fs.unlink(target);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error('Media delete failed:', err.message);
    }
  }
}

module.exports = { isEnabled, sniffExtension, saveImage, isOwnMediaUrl, pathForUrl, deleteByUrl };
