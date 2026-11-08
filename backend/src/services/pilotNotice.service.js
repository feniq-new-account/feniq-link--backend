const PlatformSetting = require('../models/platformSetting.model');
const { ApiError } = require('../utils/ApiError');

const KEY = 'persistentPilotNotice';
const DEFAULT_AR = 'نسخة تجريبية من فينيق — التطبيق قيد الاختبار والتطوير، وقد تتغير بعض الخدمات.';
const DEFAULT_EN = 'Feniq trial version — the app is being tested and improved; some services may change.';
const DEFAULTS = Object.freeze({ revision: 0, enabled: true, textAr: DEFAULT_AR, textEn: DEFAULT_EN });
const invalid = () => ApiError.badRequest('Invalid pilot notice settings.', undefined, 'INVALID_PILOT_NOTICE');
const changed = () => ApiError.conflict('Pilot notice changed. Reload before saving.', 'PILOT_NOTICE_CHANGED');

async function readNotice() {
  const row = await PlatformSetting.findOne({ key: KEY }).lean();
  return row?.value ? { ...DEFAULTS, ...row.value } : { ...DEFAULTS };
}

// Only presentation fields may be public; never expose actor IDs or history.
function publicNotice(value) {
  return {
    enabled: value.enabled === true,
    textAr: value.textAr,
    textEn: value.textEn,
  };
}

async function saveNotice(actorId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['revision', 'enabled', 'textAr', 'textEn'].includes(key)) ||
      !Number.isSafeInteger(body.revision) || body.revision < 0 ||
      typeof body.enabled !== 'boolean' ||
      ![body.textAr, body.textEn].every(value => typeof value === 'string' &&
        value.trim().length > 0 && value.trim().length <= 240 && value.length <= 240)) {
    throw invalid();
  }
  await PlatformSetting.init();
  const before = await readNotice();
  if (before.revision !== body.revision) throw changed();
  const next = {
    revision: body.revision + 1,
    enabled: body.enabled,
    textAr: body.textAr.trim(),
    textEn: body.textEn.trim(),
    updatedBy: actorId,
    updatedAt: new Date(),
    history: [...(before.history || []), {
      revision: before.revision, enabled: before.enabled,
      textAr: before.textAr, textEn: before.textEn,
      updatedAt: before.updatedAt, updatedBy: before.updatedBy,
    }].slice(-20),
  };
  const filter = { key: KEY, ...(body.revision === 0
    ? { $or: [{ 'value.revision': 0 }, { value: { $exists: false } }] }
    : { 'value.revision': body.revision }) };
  let row;
  try {
    row = await PlatformSetting.findOneAndUpdate(filter, { $set: { value: next } },
      { upsert: body.revision === 0, new: true, runValidators: true }).lean();
  } catch (error) {
    if (error.code === 11000) throw changed();
    throw error;
  }
  if (!row) throw changed();
  return row.value;
}

module.exports = { KEY, DEFAULTS, readNotice, publicNotice, saveNotice };
