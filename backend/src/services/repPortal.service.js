const mongoose = require('mongoose');
const Rep = require('../models/rep.model');
const RepAssignment = require('../models/repAssignment.model');
const RepVisit = require('../models/repVisit.model');
const Pharmacy = require('../models/pharmacy.model');
const Order = require('../models/order.model');
const Warehouse = require('../models/warehouse.model');
const { ApiError } = require('../utils/ApiError');
const { startOfBusinessMonth } = require('../utils/businessTime');
const { repRateFor } = require('../utils/repCommission');
const { runInTransaction } = require('../utils/transaction');
const { sumRepCommission } = require('./repCommissionTotals.service');
const { distanceMeters, isValidCoordinate } = require('../utils/geo');
const { pharmacyActivity } = require('./rep.service');
const pharmacyVisitCodes = require('./pharmacyVisitCode.service');
const { emitToWarehouse, EVENTS } = require('../realtime');

// The rep's own app: their pharmacies, those pharmacies' orders to the rep's
// warehouse, and logging a visit by scanning the pharmacy's QR.

const { DEFAULT_POLICY, getPolicy } = require('./visitVerification.service');
const VISIT_RADIUS_METERS = DEFAULT_POLICY.radiusMeters;
// A second scan of the same pharmacy this soon is the same visit (a double
// tap, a retry on a slow network), not a new one.
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
const RECENT_ORDERS = 20;
const RECENT_VISITS = 10;

async function loadRepOrThrow(userId) {
  const rep = await Rep.findOne({ userId }).lean();
  if (!rep) {
    throw ApiError.notFound('Rep profile not found.', 'REP_PROFILE_NOT_FOUND');
  }
  if (!rep.isActive) {
    throw ApiError.forbidden('This rep account has been switched off.', 'REP_INACTIVE');
  }
  return rep;
}

function startOfWeek(now) {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

async function getMe(rep, now = new Date()) {
  const monthStart = startOfBusinessMonth(now);
  const [warehouse, pharmacyCount, weekVisits, monthOrders, monthCommission] = await Promise.all([
    Warehouse.findById(rep.warehouseId).select('nameAr nameEn phone logo city').lean(),
    RepAssignment.countDocuments({ repId: rep._id, active: true }),
    RepVisit.countDocuments({ repId: rep._id, status: 'verified', scannedAt: { $gte: startOfWeek(now) } }),
    Order.aggregate([
      { $match: { repId: rep._id, createdAt: { $gte: monthStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$finalPrice' } } },
    ]),
    // Report these sources separately: legacy delivered orders versus actual
    // collection_v2 commission journal events (including signed corrections).
    // Neither number proves that the rep has received a payout.
    sumRepCommission({ repId: rep._id, createdAt: { $gte: monthStart } }, { sourceBreakdown: true }),
  ]);
  return {
    rep,
    warehouse,
    stats: {
      pharmacyCount,
      visitsLast7Days: weekVisits,
      monthOrdersCount: monthOrders[0]?.count ?? 0,
      monthOrdersTotal: monthOrders[0]?.total ?? 0,
      // Legacy delivery-based effective rate only; active collection_v2
      // contracts freeze area-specific terms independently. Do not market this
      // value as the current collection_v2 rate.
      ownCommissionRate: repRateFor(rep.commissionRate ?? 0, rep.warehouseShareToRep ?? false),
      // Compatibility for older clients; new clients must use the source split.
      monthCommissionAmount: monthCommission[0]?.repAmount ?? 0,
      commissionBreakdownVersion: 'legacy-delivery-and-collected-v1',
      monthLegacyDeliveredCommissionSyp: monthCommission[0]?.legacyDeliveredRepAmount ?? 0,
      monthCollectedCommissionSyp: monthCommission[0]?.collectedRepAmount ?? 0,
    },
  };
}

// The rep's pharmacies, longest-unvisited first: the list doubles as "who do I
// go to next". Never-visited pharmacies come first of all.
async function listMyPharmacies(rep, { search } = {}) {
  const assignments = await RepAssignment.find({ repId: rep._id, active: true }).select('pharmacyId').lean();
  const pharmacyIds = assignments.map((a) => a.pharmacyId);
  const filter = { _id: { $in: pharmacyIds } };
  const text = typeof search === 'string' ? search.trim() : '';
  if (text) {
    const pattern = new RegExp(text.slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ nameAr: pattern }, { nameEn: pattern }, { ownerName: pattern }, { address: pattern }];
  }
  const [pharmacies, activity] = await Promise.all([
    Pharmacy.find(filter).select('nameAr nameEn ownerName address city areaType phone location').lean(),
    pharmacyActivity(rep.warehouseId, pharmacyIds),
  ]);
  const visitedAt = (row) => row.activity.lastVerifiedVisitAt?.getTime() ?? -Infinity;
  return pharmacies
    .map((pharmacy) => ({ pharmacy, activity: activity.get(pharmacy._id.toString()) }))
    .sort((a, b) => visitedAt(a) - visitedAt(b) || a.pharmacy.nameAr.localeCompare(b.pharmacy.nameAr, 'ar'));
}

async function assertAssigned(rep, pharmacyId) {
  const assigned = await RepAssignment.exists({ repId: rep._id, pharmacyId, active: true });
  if (!assigned) {
    throw ApiError.forbidden('This pharmacy is not assigned to you.', 'PHARMACY_NOT_ASSIGNED');
  }
}

async function getMyPharmacy(rep, pharmacyId) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw ApiError.badRequest('Invalid id.', undefined, 'INVALID_PHARMACY_ID');
  }
  const id = new mongoose.Types.ObjectId(pharmacyId);
  await assertAssigned(rep, id);
  const [pharmacy, activity, orders, visits] = await Promise.all([
    Pharmacy.findById(id).select('nameAr nameEn ownerName address city areaType phone location').lean(),
    pharmacyActivity(rep.warehouseId, [id]),
    Order.find({ warehouseId: rep.warehouseId, pharmacyId: id })
      .sort({ createdAt: -1 })
      .limit(RECENT_ORDERS)
      .select('orderNumber status finalPrice createdAt repId')
      .lean(),
    RepVisit.find({ warehouseId: rep.warehouseId, pharmacyId: id })
      .sort({ scannedAt: -1 })
      .limit(RECENT_VISITS)
      .lean(),
  ]);
  return { pharmacy, activity: activity.get(id.toString()), orders, visits };
}

function readCoordinates({ latitude, longitude, accuracy }) {
  const lat = latitude;
  const lng = longitude;
  if (!isValidCoordinate(lng, lat)) {
    throw ApiError.badRequest('A valid location is required to log a visit.', undefined, 'INVALID_LOCATION');
  }
  const accuracyMeters = typeof accuracy === 'number' ? accuracy : NaN;
  return {
    coordinates: [lng, lat],
    accuracyMeters: Number.isFinite(accuracyMeters) && accuracyMeters >= 0 ? accuracyMeters : null,
  };
}

// Decides what a scan proves - see repVisit.model.js for the four outcomes.
function judgeVisit({ pharmacy, coordinates, accuracyMeters, isMocked, capturedAt, now = new Date(), policy = DEFAULT_POLICY }) {
  const point = pharmacy.location && Array.isArray(pharmacy.location.coordinates)
    ? pharmacy.location.coordinates : null;
  const exactDistance = point && point.length === 2 ? distanceMeters(coordinates, point) : null;
  const distance = exactDistance === null ? null : Math.round(exactDistance);
  if (isMocked === true) return { status: 'mock_location', distance };
  if (distance === null) return { status: 'no_pharmacy_location', distance };
  if (pharmacy.locationApproval !== 'approved') return { status: 'location_unapproved', distance };
  if (accuracyMeters === null || !Number.isFinite(accuracyMeters) || accuracyMeters > policy.maxAccuracyMeters) {
    return { status: 'poor_accuracy', distance };
  }
  const captured = typeof capturedAt === 'string' ? new Date(capturedAt).getTime() : NaN;
  const age = now.getTime() - captured;
  if (!Number.isFinite(age) || age < -30000 || age > policy.maxAgeSeconds * 1000) {
    return { status: 'stale_location', distance };
  }
  return { status: exactDistance <= policy.radiusMeters ? 'verified' : 'out_of_range', distance };
}

// A scan of a pharmacy's visit QR. Every scan is stored - the ones that did
// not verify too, so the warehouse can see them - except an immediate repeat
// of a verified visit, which returns that visit instead of counting twice.
async function recordVisit(rep, { code, latitude, longitude, accuracy, isMocked, capturedAt }, now = new Date()) {
  const visitCode = pharmacyVisitCodes.parseVisitCode(code);
  if (!visitCode) {
    throw ApiError.badRequest('This is not a Feniq visit code.', undefined, 'INVALID_VISIT_CODE');
  }
  const pharmacy = await pharmacyVisitCodes.findPharmacyByVisitCode(visitCode);
  if (!pharmacy || pharmacy.isActive === false) {
    throw ApiError.notFound('No pharmacy has this visit code.', 'VISIT_CODE_NOT_FOUND');
  }
  const { coordinates, accuracyMeters } = readCoordinates({ latitude, longitude, accuracy });
  const policy = await getPolicy();
  const result = await runInTransaction(async (session) => {
    // Serialize scans through the existing active assignment. A competing
    // transaction retries from a fresh snapshot and sees the committed visit.
    // Keeping the lock write and visit in one transaction also covers crashes.
    const assigned = await RepAssignment.updateOne(
      { repId: rep._id, pharmacyId: pharmacy._id, active: true },
      { $inc: { __v: 1 } },
      { session }
    );
    if (!assigned.matchedCount) {
      throw ApiError.forbidden('This pharmacy is not assigned to you.', 'PHARMACY_NOT_ASSIGNED');
    }
    // Serialize against administrative moves/revocations of the premises as
    // well. A transaction retry must judge the current approved point, never
    // a location fetched before an administrator changed it.
    const currentPharmacy = await Pharmacy.findOneAndUpdate(
      { _id: pharmacy._id, isActive: { $ne: false } }, { $inc: { __v: 1 } },
      { session, new: true }
    ).select('_id nameAr nameEn location locationApproval isActive').lean();
    if (!currentPharmacy) throw ApiError.notFound('Pharmacy not found.', 'VISIT_CODE_NOT_FOUND');
    const { status, distance } = judgeVisit({ pharmacy: currentPharmacy, coordinates, accuracyMeters, isMocked, capturedAt, now, policy });
    if (status === 'verified') {
      const recent = await RepVisit.findOne({
        repId: rep._id, pharmacyId: pharmacy._id, status: 'verified',
        scannedAt: { $gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      }).session(session).lean();
      if (recent) return { visit: recent, pharmacy: currentPharmacy, duplicate: true };
    }
    const [visit] = await RepVisit.create([{
      repId: rep._id, warehouseId: rep.warehouseId, pharmacyId: pharmacy._id,
      status, coordinates, accuracyMeters, distanceMeters: distance, scannedAt: now,
      locationCapturedAt: typeof capturedAt === 'string' && Number.isFinite(Date.parse(capturedAt)) ? new Date(capturedAt) : null,
      verificationPolicy: { radiusMeters: policy.radiusMeters, maxAccuracyMeters: policy.maxAccuracyMeters, maxAgeSeconds: policy.maxAgeSeconds },
    }], { session });
    return { visit: visit.toObject(), pharmacy: currentPharmacy, duplicate: false };
  });
  if (!result.duplicate) {
    emitToWarehouse(rep.warehouseId, EVENTS.REP_VISIT_CREATED, {
      visitId: result.visit._id.toString(), repId: rep._id.toString(),
    });
  }
  return result;
}

async function listMyVisits(rep, { limit, after } = {}) {
  const filter = { repId: rep._id };
  if (after) filter._id = { $lt: new mongoose.Types.ObjectId(after) };
  const rows = await RepVisit.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const pharmacies = await Pharmacy.find({ _id: { $in: page.map((v) => v.pharmacyId) } })
    .select('nameAr nameEn')
    .lean();
  const byId = new Map(pharmacies.map((p) => [p._id.toString(), p]));
  return {
    rows: page.map((visit) => ({ visit, pharmacy: byId.get(visit.pharmacyId.toString()) ?? null })),
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]._id.toString() : null,
  };
}

module.exports = {
  VISIT_RADIUS_METERS,
  loadRepOrThrow,
  getMe,
  listMyPharmacies,
  getMyPharmacy,
  recordVisit,
  listMyVisits,
  judgeVisit,
};
