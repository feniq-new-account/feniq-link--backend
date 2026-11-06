const PlatformSetting = require('../models/platformSetting.model');
const { ApiError } = require('../utils/ApiError');
const KEY = 'pharmacistLaunch';
const DEFAULT_MESSAGE = 'التسجيل والتصفح متاحان. استقبال الطلبات لم يبدأ بعد.';
const PILOT_ENDED_MESSAGE = 'انتهت فترة تجربة الطلبات. يمكنك متابعة تصفح الأدوية حتى بدء استقبال الطلبات من جديد.';

// No environment override or stale server cache can silently open ordering.
async function readLaunch() {
  const row = await PlatformSetting.findOne({ key: KEY }).lean();
  return row?.value || { mode: 'registration_only', message: DEFAULT_MESSAGE, revision: 0 };
}
// An expiry is checked against the server clock on EVERY public status read
// and order creation. Closing is therefore safe even if the server is idle
// when the deadline passes; no timer, cron or deployment is required.
function publicStatus(value, now = Date.now()) {
  const closesAt = value.orderingClosesAt ?? null;
  const deadlineExpired = value.mode === 'ordering_open' &&
    closesAt !== null && !(Date.parse(closesAt) > Number(now));
  const orderingEnabled = value.mode === 'ordering_open' && !deadlineExpired;
  // Legacy Android clients require orderingEnabled to agree with the public
  // mode. Present the EFFECTIVE closed mode after expiry, while GET
  // /admin/launch preserves the configured mode and its original deadline.
  return {
    mode: orderingEnabled ? 'ordering_open' : 'registration_only',
    orderingEnabled,
    message: deadlineExpired ? PILOT_ENDED_MESSAGE : value.message,
    revision: value.revision,
    orderingClosesAt: closesAt,
    orderingClosedByDeadline: deadlineExpired,
  };
}
async function saveLaunch(actorId, body) {
  if (!body || Object.keys(body).some(key => !['mode', 'message', 'revision', 'orderingClosesAt'].includes(key)) ||
      !['registration_only', 'ordering_open'].includes(body.mode) || typeof body.message !== 'string' ||
      !body.message.trim() || body.message.length > 500 || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
      (body.orderingClosesAt !== undefined && body.orderingClosesAt !== null &&
        (typeof body.orderingClosesAt !== 'string' ||
          !Number.isFinite(Date.parse(body.orderingClosesAt)) ||
          new Date(body.orderingClosesAt).toISOString() !== body.orderingClosesAt))) {
    throw ApiError.badRequest('Invalid launch settings.', undefined, 'INVALID_LAUNCH_SETTINGS');
  }
  await PlatformSetting.init();
  const previous = await readLaunch();
  if (previous.revision !== body.revision) throw ApiError.conflict('Launch settings changed. Reload before saving.', 'LAUNCH_CHANGED');
  // Old admin clients may omit the field. Retain the existing deadline in that
  // case, so saving a message cannot silently remove a pilot time limit.
  const orderingClosesAt = body.orderingClosesAt === undefined
    ? (previous.orderingClosesAt ?? null) : body.orderingClosesAt;
  if (body.mode === 'ordering_open' && orderingClosesAt !== null && Date.parse(orderingClosesAt) <= Date.now()) {
    throw ApiError.badRequest('Ordering deadline must be in the future.', undefined, 'INVALID_LAUNCH_DEADLINE');
  }
  const value = { mode: body.mode, message: body.message.trim(), revision: body.revision + 1,
    orderingClosesAt, updatedBy: actorId, updatedAt: new Date(),
    history: [...(previous.history || []), { mode: previous.mode, message: previous.message,
      revision: previous.revision, orderingClosesAt: previous.orderingClosesAt ?? null,
      updatedBy: previous.updatedBy, updatedAt: previous.updatedAt }].slice(-20) };
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
