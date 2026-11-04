const PlatformSetting = require('../models/platformSetting.model');
const { ApiError } = require('../utils/ApiError');
const KEY = 'pharmacistLaunch';
const DEFAULT_MESSAGE = 'التسجيل والتصفح متاحان. استقبال الطلبات لم يبدأ بعد.';

// No environment override or stale server cache can silently open ordering.
async function readLaunch() {
  const row = await PlatformSetting.findOne({ key: KEY }).lean();
  return row?.value || { mode: 'registration_only', message: DEFAULT_MESSAGE, revision: 0 };
}
function publicStatus(value) {
  return { mode: value.mode, orderingEnabled: value.mode === 'ordering_open', message: value.message, revision: value.revision };
}
async function saveLaunch(actorId, body) {
  if (!body || Object.keys(body).some(key => !['mode', 'message', 'revision'].includes(key)) ||
      !['registration_only', 'ordering_open'].includes(body.mode) || typeof body.message !== 'string' ||
      !body.message.trim() || body.message.length > 500 || !Number.isSafeInteger(body.revision) || body.revision < 0) {
    throw ApiError.badRequest('Invalid launch settings.', undefined, 'INVALID_LAUNCH_SETTINGS');
  }
  await PlatformSetting.init();
  const previous = await readLaunch();
  if (previous.revision !== body.revision) throw ApiError.conflict('Launch settings changed. Reload before saving.', 'LAUNCH_CHANGED');
  const value = { mode: body.mode, message: body.message.trim(), revision: body.revision + 1,
    updatedBy: actorId, updatedAt: new Date(),
    history: [...(previous.history || []), { mode: previous.mode, message: previous.message,
      revision: previous.revision, updatedBy: previous.updatedBy, updatedAt: previous.updatedAt }].slice(-20) };
  const filter = { key: KEY, ...(body.revision === 0
    ? { $or: [{ 'value.revision': 0 }, { value: { $exists: false } }] }
    : { 'value.revision': body.revision }) };
  let row;
  try {
    row = await PlatformSetting.findOneAndUpdate(filter, { $set: { value } },
      { upsert: body.revision === 0, new: true, runValidators: true }).lean();
  } catch (error) {
    if (error.code === 11000) throw ApiError.conflict('Launch settings changed. Reload before saving.', 'LAUNCH_CHANGED');
    throw error;
  }
  if (!row) throw ApiError.conflict('Launch settings changed. Reload before saving.', 'LAUNCH_CHANGED');
  return row.value;
}
async function assertOrderingOpen() {
  const status = publicStatus(await readLaunch());
  if (!status.orderingEnabled) throw new ApiError(409, status.message, status, 'ORDERING_NOT_STARTED');
}
module.exports = { KEY, readLaunch, publicStatus, saveLaunch, assertOrderingOpen };
