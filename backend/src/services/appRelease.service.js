const AppRelease = require('../models/appRelease.model');
const { ApiError } = require('../utils/ApiError');

const ROLES = ['pharmacy', 'rep', 'warehouse'];
const CERTIFICATE = (process.env.ANDROID_CERT_SHA256 || 'D4D2C93E38086E9B4847A74C822C527DF9336DB85752465B83593F8585FA5DD4').replace(/[: ]/g, '').toUpperCase();
const DEFAULT_ORIGIN = 'https://feniq-site.onrender.com';
const allowedOrigins = (process.env.APK_UPDATE_ORIGINS || DEFAULT_ORIGIN).split(',').map((value) => value.trim());
let cached;
let cachedAt = 0;

function invalid(message = 'Invalid Android release settings.') { return ApiError.badRequest(message, undefined, 'INVALID_APP_RELEASE'); }
function originFor(value = DEFAULT_ORIGIN) {
  let url;
  try { url = new URL(value); } catch { throw invalid('Invalid update source.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !['', '/'].includes(url.pathname) || !allowedOrigins.includes(url.origin)) throw invalid('Update source is not an approved HTTPS origin.');
  return url.origin;
}

async function inspectPublishedRelease(sourceOrigin, fetcher = fetch) {
  const origin = originFor(sourceOrigin);
  const response = await fetcher(`${origin}/version.json`, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) throw invalid('Could not read the published Android manifest.');
  const raw = await response.text();
  if (raw.length > 16384) throw invalid('Invalid Android manifest.');
  let data;
  try { data = JSON.parse(raw); } catch { throw invalid('Invalid Android manifest.'); }
  // A syntactically valid JSON document can still be null or a primitive.
  // Treat it as an invalid manifest instead of throwing a TypeError (HTTP 500).
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('Invalid Android manifest.');
  const latestBuild = Number(data.build);
  if (data.apk !== true || !Number.isInteger(latestBuild) || latestBuild < 1 || latestBuild > 2100000000 ||
      typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.sha256) ||
      typeof data.certificateSha256 !== 'string' || !/^[A-F0-9]{64}$/.test(CERTIFICATE) || data.certificateSha256.replace(/[: ]/g, '').toUpperCase() !== CERTIFICATE ||
      !Number.isInteger(data.size) || data.size < 500000 || data.size > 200 * 1024 * 1024) throw invalid('The published APK has no matching signed release manifest.');
  if (data.applicationId !== 'com.feniq.link' || typeof data.versionName !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(data.versionName) ||
      data.file !== `releases/${latestBuild}-${data.sha256.slice(0, 12).toLowerCase()}.apk`) {
    throw invalid('The release does not identify an immutable verified Android file.');
  }
  const apkUrl = `${origin}/${data.file}`;
  const head = await fetcher(apkUrl, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000) });
  const size = Number(head.headers.get('content-length'));
  const contentType = (head.headers.get('content-type') || '').split(';')[0];
  if (!head.ok || size !== data.size || !['application/vnd.android.package-archive', 'application/octet-stream'].includes(contentType)) {
    throw invalid('The published APK does not match its manifest.');
  }
  return { latestBuild, versionName: data.versionName, apkUrl, size: data.size, sha256: data.sha256.toLowerCase(), certificateSha256: CERTIFICATE, applicationId: 'com.feniq.link' };
}

function validateRoles(value, latestBuild) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !ROLES.includes(key))) throw invalid();
  return Object.fromEntries(ROLES.map((role) => {
    const policy = value[role];
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) ||
        Object.keys(policy).some((key) => !['recommendedBuild', 'minimumBuild', 'mandatoryAfter'].includes(key))) throw invalid();
    const { recommendedBuild, minimumBuild } = policy;
    if (!Number.isInteger(minimumBuild) || minimumBuild < 1 || !Number.isInteger(recommendedBuild) ||
        recommendedBuild < minimumBuild || recommendedBuild > latestBuild) throw invalid('Role build numbers must match an available release.');
    const mandatoryAfter = policy.mandatoryAfter == null ? null : new Date(policy.mandatoryAfter);
    if (mandatoryAfter && (typeof policy.mandatoryAfter !== 'string' || !Number.isFinite(mandatoryAfter.getTime()))) throw invalid('Invalid mandatory update date.');
    return [role, { recommendedBuild, minimumBuild, mandatoryAfter }];
  }));
}

async function readRelease({ fresh = false } = {}) {
  if (!fresh && cached !== undefined && Date.now() - cachedAt < 10000) return cached;
  cached = await AppRelease.findById('android').lean();
  cachedAt = Date.now();
  return cached;
}

function publicRelease(row) {
  if (!row || !row.enabled) return null;
  const { latestBuild, versionName, apkUrl, sha256, size, certificateSha256, applicationId, roles, revision } = row;
  return { latestBuild, versionName, apkUrl, sha256, size, certificateSha256, applicationId, roles, revision };
}

function evaluateRole(row, role, build, now = new Date()) {
  if (!row?.enabled || !ROLES.includes(role)) return 'none';
  const policy = row.roles[role];
  if (!policy) return 'none';
  const due = !policy.mandatoryAfter || now >= new Date(policy.mandatoryAfter);
  if (due && build < policy.minimumBuild) return 'mandatory';
  if (build < policy.recommendedBuild) return 'optional';
  return 'none';
}

async function saveRelease(actorId, body, { fetcher = fetch } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['enabled', 'sourceOrigin', 'versionName', 'roles', 'notes', 'revision'].includes(key)) ||
      typeof body.enabled !== 'boolean' || !Number.isInteger(body.revision) || body.revision < 0) throw invalid();
  const before = await readRelease({ fresh: true });
  if ((before?.revision ?? 0) !== body.revision) throw ApiError.conflict('Release settings changed. Reload before saving.', 'APP_RELEASE_CHANGED');
  let fields;
  if (!body.enabled) {
    if (!before) return null;
    fields = { enabled: false, updatedBy: actorId };
  } else {
    const artifact = await inspectPublishedRelease(body.sourceOrigin, fetcher);
    if (before && artifact.latestBuild < before.latestBuild) throw invalid('A published APK cannot downgrade the installed build.');
    if (body.versionName !== artifact.versionName) throw invalid('Version name must match the published APK.');
    if (typeof body.versionName !== 'string' || !/^\d+\.\d+\.\d+$/.test(body.versionName) ||
        typeof body.notes !== 'string' || body.notes.length > 2000) throw invalid();
    fields = { ...artifact, enabled: true, versionName: body.versionName, notes: body.notes,
      roles: validateRoles(body.roles, artifact.latestBuild), updatedBy: actorId };
  }
  const previous = before ? { ...publicRelease({ ...before, enabled: true }), enabled: before.enabled, updatedBy: before.updatedBy, updatedAt: before.updatedAt } : null;
  const update = { $set: fields, $inc: { revision: 1 },
    ...(previous ? { $push: { history: { $each: [previous], $slice: -20 } } } : {}) };
  let result;
  try {
    result = await AppRelease.findOneAndUpdate({ _id: 'android', revision: body.revision }, update,
      { new: true, upsert: !before, runValidators: true, setDefaultsOnInsert: false }).lean();
  } catch (error) {
    if (error.code === 11000) throw ApiError.conflict('Release settings changed. Reload before saving.', 'APP_RELEASE_CHANGED');
    throw error;
  }
  if (!result) throw ApiError.conflict('Release settings changed. Reload before saving.', 'APP_RELEASE_CHANGED');
  cached = result; cachedAt = Date.now();
  return result;
}

async function enforceMobileBuild(req, user) {
  if (req.headers?.['x-feniq-client'] !== 'android' || !ROLES.includes(user.role)) return;
  const text = req.headers['x-app-build'];
  if (typeof text !== 'string' || !/^[1-9]\d{0,9}$/.test(text) || Number(text) > 2100000000) throw invalid('Invalid installed app build.');
  const row = await readRelease();
  if (evaluateRole(row, user.role, Number(text)) === 'mandatory') {
    throw new ApiError(426, 'Update Feniq to continue.', { release: publicRelease(row), serverTime: new Date().toISOString() }, 'APP_UPDATE_REQUIRED');
  }
}

module.exports = { ROLES, CERTIFICATE, DEFAULT_ORIGIN, inspectPublishedRelease, validateRoles, readRelease, publicRelease, evaluateRole, saveRelease, enforceMobileBuild };
