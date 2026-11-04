const PlatformSetting = require('../models/platformSetting.model');
const Pharmacy = require('../models/pharmacy.model');
const Audit = require('../models/pharmacyLocationAudit.model');
const { ApiError } = require('../utils/ApiError');
const { isValidCoordinate } = require('../utils/geo');
const { runInTransaction } = require('../utils/transaction');
const KEY = 'visitVerification';
const DEFAULT_POLICY = Object.freeze({ radiusMeters: 150, maxAccuracyMeters: 100, maxAgeSeconds: 120 });

async function getPolicy() {
  const setting = await PlatformSetting.findOne({ key: KEY }).select('value').lean();
  return { ...DEFAULT_POLICY, ...(setting?.value || {}), version: setting?.value?.version || 0 };
}
function validatePolicy(body) {
  const ranges = { radiusMeters: [25, 500], maxAccuracyMeters: [10, 100], maxAgeSeconds: [15, 300] };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isInteger(body?.[key]) || body[key] < min || body[key] > max) {
      throw ApiError.badRequest(`Invalid ${key}.`, undefined, 'INVALID_VISIT_POLICY');
    }
  }
  if (!Number.isInteger(body.version) || body.version < 0) throw ApiError.badRequest('Missing version.', undefined, 'INVALID_VISIT_POLICY');
  return Object.fromEntries(Object.keys(ranges).map((key) => [key, body[key]]));
}
async function savePolicy(body, actorId) {
  const policy = validatePolicy(body);
  const filter = { key: KEY, ...(body.version ? { 'value.version': body.version } : { 'value.version': { $exists: false } }) };
  try {
    const updated = await PlatformSetting.findOneAndUpdate(filter,
      { $set: { value: { ...policy, version: body.version + 1, updatedBy: String(actorId) } } },
      { upsert: body.version === 0, new: true }).lean();
    if (!updated) throw ApiError.conflict('Policy changed; reload first.', 'VISIT_POLICY_CHANGED');
    return getPolicy();
  } catch (error) {
    if (error.code === 11000) throw ApiError.conflict('Policy changed; reload first.', 'VISIT_POLICY_CHANGED');
    throw error;
  }
}
function locationSummary(row) {
  return { id: String(row._id), nameAr: row.nameAr, nameEn: row.nameEn, city: row.city,
    address: row.address, phone: row.phone, location: row.location || null,
    approval: row.locationApproval || 'pending', version: row.locationVersion || 0,
    approvedAt: row.locationApprovedAt || null };
}
async function setPharmacyLocation(pharmacyId, actorId, body) {
  const { latitude, longitude, approval, version } = body || {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !isValidCoordinate(longitude, latitude) ||
      !['approved', 'pending'].includes(approval) || !Number.isInteger(version) || version < 0) {
    throw ApiError.badRequest('Valid coordinates and approval are required.', undefined, 'INVALID_PHARMACY_LOCATION');
  }
  return runInTransaction(async (session) => {
    const before = await Pharmacy.findById(pharmacyId).session(session).lean();
    if (!before) throw ApiError.notFound('Pharmacy not found.', 'PHARMACY_NOT_FOUND');
    if ((before.locationVersion || 0) !== version) throw ApiError.conflict('Location changed; reload first.', 'PHARMACY_LOCATION_CHANGED');
    const row = await Pharmacy.findOneAndUpdate({ _id: pharmacyId,
      ...(version ? { locationVersion: version } : { $or: [{ locationVersion: 0 }, { locationVersion: { $exists: false } }] }) },
    { $set: { location: { type: 'Point', coordinates: [longitude, latitude] }, locationApproval: approval,
      locationApprovedBy: approval === 'approved' ? actorId : null, locationApprovedAt: approval === 'approved' ? new Date() : null },
      $inc: { locationVersion: 1 } }, { session, new: true }).lean();
    if (!row) throw ApiError.conflict('Location changed; reload first.', 'PHARMACY_LOCATION_CHANGED');
    await Audit.create([{ pharmacyId, actorId, before: locationSummary(before), after: locationSummary(row) }], { session });
    return locationSummary(row);
  });
}
module.exports = { DEFAULT_POLICY, getPolicy, savePolicy, setPharmacyLocation, locationSummary };
