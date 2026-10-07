const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Rep = require('../models/rep.model');
const RepAssignment = require('../models/repAssignment.model');
const RepVisit = require('../models/repVisit.model');
const Pharmacy = require('../models/pharmacy.model');
const Order = require('../models/order.model');
const { ApiError } = require('../utils/ApiError');
const { assertPasswordPolicy } = require('../utils/password');
const { normalizePhone, isValidPhone, toInternationalPhone } = require('../utils/phone');
const { startOfBusinessMonth } = require('../utils/businessTime');
const { runInTransaction } = require('../utils/transaction');
const { parseRepCommissionRate, MAX_REP_COMMISSION_RATE } = require('../utils/repCommission');
const { sumRepCommission } = require('./repCommissionTotals.service');
const { revokeAllSessions } = require('./auth.service');
const pharmacyVisitCodes = require('./pharmacyVisitCode.service');

// The warehouse's side of field reps: creating their logins, switching them
// off, assigning pharmacies to them, and reading their visits. The rep's own
// app talks to repPortal.service.js instead.

const BCRYPT_SALT_ROUNDS = 10;
const VISIT_WINDOW_DAYS = 30;
const SEARCH_LIMIT = 20;

function assertObjectId(value, code = 'INVALID_ID') {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw ApiError.badRequest('Invalid id.', undefined, code);
  }
  return new mongoose.Types.ObjectId(value);
}

function cleanName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (value.length < 2 || value.length > 60) {
    throw ApiError.badRequest('Please enter the rep name (2-60 characters).', undefined, 'INVALID_REP_NAME');
  }
  return value;
}

// The commission rate from a request: absent -> null (leave it), valid -> the
// number, anything else -> a 400.
function readCommissionRate(value) {
  if (value === undefined || value === null || value === '') return null;
  const rate = parseRepCommissionRate(value);
  if (rate === null) {
    throw ApiError.badRequest(
      `The commission rate must be a number from 0 to ${MAX_REP_COMMISSION_RATE} (at most two decimals).`,
      undefined,
      'INVALID_COMMISSION_RATE'
    );
  }
  return rate;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadWarehouseRepOrThrow(warehouseId, repId) {
  const rep = await Rep.findOne({ _id: assertObjectId(repId, 'INVALID_REP_ID'), warehouseId });
  if (!rep) {
    throw ApiError.notFound('Rep not found.', 'REP_NOT_FOUND');
  }
  return rep;
}

// A rep's login, born active - the warehouse is vouching for its own employee,
// there is no approval step. The password is a temporary one the warehouse
// hands over, so the app makes the rep choose their own on first sign-in
// (mustChangePassword, same as an admin reset).
async function createRep(warehouseId, { name, phone, password, commissionRate }) {
  const repName = cleanName(name);
  const rate = readCommissionRate(commissionRate);
  const cleanPhone = normalizePhone(typeof phone === 'string' ? phone : '');
  if (!isValidPhone(cleanPhone)) {
    throw ApiError.badRequest('Please enter a valid phone number.', undefined, 'INVALID_PHONE_FORMAT');
  }
  const appPhone = toInternationalPhone(cleanPhone);
  assertPasswordPolicy(password, { role: 'rep', code: 'INVALID_PASSWORD' });

  // Both spellings: a pharmacy registered from the app holds the +963 form, a
  // warehouse created from the admin panel may hold the 09 one.
  const localPhone = `0${appPhone.slice(4)}`;
  const existing = await User.findOne({ phone: { $in: [appPhone, localPhone] } }).select('_id').lean();
  if (existing) {
    throw ApiError.conflict('An account already exists for this phone number.', 'PHONE_ALREADY_REGISTERED');
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  try {
    return await runInTransaction(async (session) => {
      const [user] = await User.create(
        [
          {
            name: repName,
            phone: appPhone,
            password: hashedPassword,
            role: 'rep',
            status: 'active',
            mustChangePassword: true,
          },
        ],
        { session }
      );
      const [rep] = await Rep.create(
        [{ userId: user._id, warehouseId, name: repName, phone: appPhone, commissionRate: rate ?? 0 }],
        { session }
      );
      return rep;
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw ApiError.conflict('An account already exists for this phone number.', 'PHONE_ALREADY_REGISTERED');
    }
    throw err;
  }
}

// Rename, or switch on/off. Switching off blocks the login and ends every
// session at once, so a rep who left cannot keep using a phone that is still
// signed in. Their pharmacies stay assigned until the warehouse moves them.
async function updateRep(warehouseId, repId, { name, isActive, commissionRate } = {}) {
  const rep = await loadWarehouseRepOrThrow(warehouseId, repId);
  const userUpdate = {};
  const rate = readCommissionRate(commissionRate);
  // Only orders placed from now on carry the new rate: each order froze the
  // rate it was placed under (order.model.js's repCommission).
  if (rate !== null) rep.commissionRate = rate;
  if (name !== undefined) {
    rep.name = cleanName(name);
    userUpdate.name = rep.name;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      throw ApiError.badRequest('isActive must be true or false.', undefined, 'INVALID_IS_ACTIVE');
    }
    if (isActive !== rep.isActive) {
      rep.isActive = isActive;
      userUpdate.status = isActive ? 'active' : 'blocked';
    }
  }
  await rep.save();
  if (Object.keys(userUpdate).length > 0) {
    const update = { $set: userUpdate };
    if (userUpdate.status === 'blocked') update.$inc = { tokenVersion: 1 };
    await User.updateOne({ _id: rep.userId }, update);
    if (userUpdate.status === 'blocked') await revokeAllSessions(rep.userId);
  }
  return rep;
}

// The warehouse sets a temporary password for its own rep (forgot it, or a
// phone changed hands). Same effect as the admin reset: every session ends,
// any lockout is lifted, and the app makes the rep pick a new one.
async function resetRepPassword(warehouseId, repId, { password }) {
  const rep = await loadWarehouseRepOrThrow(warehouseId, repId);
  assertPasswordPolicy(password, { role: 'rep', code: 'INVALID_PASSWORD' });
  await User.updateOne(
    { _id: rep.userId },
    {
      $set: {
        password: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      $inc: { tokenVersion: 1 },
    }
  );
  await revokeAllSessions(rep.userId);
  return rep;
}

// Per-pharmacy activity at one warehouse: the latest visit (any rep of this
// warehouse) and the order numbers. Orders here are ALL the pharmacy's orders
// to the warehouse - what the rep and the warehouse want to see about a
// customer - not only the ones attributed to a rep.
async function pharmacyActivity(warehouseId, pharmacyIds, now = new Date()) {
  const byId = new Map(pharmacyIds.map((id) => [id.toString(), {
    lastVisitAt: null,
    lastVerifiedVisitAt: null,
    lastOrderAt: null,
    monthOrdersCount: 0,
    monthOrdersTotal: 0,
  }]));
  if (pharmacyIds.length === 0) return byId;

  const monthStart = startOfBusinessMonth(now);
  const [visits, orders] = await Promise.all([
    RepVisit.aggregate([
      { $match: { warehouseId, pharmacyId: { $in: pharmacyIds } } },
      {
        $group: {
          _id: '$pharmacyId',
          lastVisitAt: { $max: '$scannedAt' },
          lastVerifiedVisitAt: {
            $max: { $cond: [{ $eq: ['$status', 'verified'] }, '$scannedAt', null] },
          },
        },
      },
    ]),
    Order.aggregate([
      { $match: { warehouseId, pharmacyId: { $in: pharmacyIds }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$pharmacyId',
          lastOrderAt: { $max: '$createdAt' },
          monthOrdersCount: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, 1, 0] } },
          monthOrdersTotal: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, '$finalPrice', 0] } },
        },
      },
    ]),
  ]);
  for (const row of visits) {
    Object.assign(byId.get(row._id.toString()), {
      lastVisitAt: row.lastVisitAt,
      lastVerifiedVisitAt: row.lastVerifiedVisitAt,
    });
  }
  for (const row of orders) {
    Object.assign(byId.get(row._id.toString()), {
      lastOrderAt: row.lastOrderAt,
      monthOrdersCount: row.monthOrdersCount,
      monthOrdersTotal: row.monthOrdersTotal,
    });
  }
  return byId;
}

// Every rep of the warehouse with the numbers its Reps page shows: how many
// pharmacies, visits over the last 30 days, and this month's orders that were
// placed under the rep (order.repId - what their commission is counted on).
async function listReps(warehouseId, now = new Date()) {
  const reps = await Rep.find({ warehouseId }).sort({ createdAt: -1 }).lean();
  if (reps.length === 0) return [];
  const repIds = reps.map((rep) => rep._id);
  const since = new Date(now.getTime() - VISIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const monthStart = startOfBusinessMonth(now);

  const [assignments, visits, orders, commissions] = await Promise.all([
    RepAssignment.aggregate([
      { $match: { repId: { $in: repIds }, active: true } },
      { $group: { _id: '$repId', count: { $sum: 1 } } },
    ]),
    RepVisit.aggregate([
      { $match: { warehouseId, repId: { $in: repIds }, scannedAt: { $gte: since } } },
      {
        $group: {
          _id: '$repId',
          visits: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } },
          unverified: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 0, 1] } },
          lastVisitAt: { $max: '$scannedAt' },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          warehouseId,
          repId: { $in: repIds },
          createdAt: { $gte: monthStart },
          status: { $ne: 'cancelled' },
        },
      },
      { $group: { _id: '$repId', count: { $sum: 1 }, total: { $sum: '$finalPrice' } } },
    ]),
    // The month's commission: delivered orders only, less any credited return.
    sumRepCommission({ warehouseId, repId: { $in: repIds }, createdAt: { $gte: monthStart } }, { byRep: true }),
  ]);
  const index = (rows) => new Map(rows.map((row) => [row._id.toString(), row]));
  const assignmentsByRep = index(assignments);
  const visitsByRep = index(visits);
  const ordersByRep = index(orders);
  const commissionByRep = index(commissions);

  return reps.map((rep) => {
    const key = rep._id.toString();
    return {
      rep,
      pharmacyCount: assignmentsByRep.get(key)?.count ?? 0,
      visits30d: visitsByRep.get(key)?.visits ?? 0,
      unverifiedVisits30d: visitsByRep.get(key)?.unverified ?? 0,
      lastVisitAt: visitsByRep.get(key)?.lastVisitAt ?? null,
      monthOrdersCount: ordersByRep.get(key)?.count ?? 0,
      monthOrdersTotal: ordersByRep.get(key)?.total ?? 0,
      monthCommission: {
        repAmount: commissionByRep.get(key)?.repAmount ?? 0,
        feniqAmount: commissionByRep.get(key)?.feniqAmount ?? 0,
        savingAmount: commissionByRep.get(key)?.savingAmount ?? 0,
      },
    };
  });
}

async function listRepPharmacies(warehouseId, repId) {
  const rep = await loadWarehouseRepOrThrow(warehouseId, repId);
  const assignments = await RepAssignment.find({ repId: rep._id, active: true })
    .select('pharmacyId createdAt')
    .lean();
  const pharmacyIds = assignments.map((a) => a.pharmacyId);
  const [pharmacies, activity] = await Promise.all([
    Pharmacy.find({ _id: { $in: pharmacyIds } })
      .select('nameAr nameEn ownerName address city areaType phone location')
      .lean(),
    pharmacyActivity(warehouseId, pharmacyIds),
  ]);
  const assignedAt = new Map(assignments.map((a) => [a.pharmacyId.toString(), a.createdAt]));
  return {
    rep,
    pharmacies: pharmacies
      .map((pharmacy) => ({
        pharmacy,
        assignedAt: assignedAt.get(pharmacy._id.toString()),
        activity: activity.get(pharmacy._id.toString()),
      }))
      .sort((a, b) => a.pharmacy.nameAr.localeCompare(b.pharmacy.nameAr, 'ar')),
  };
}

// Finding a pharmacy to assign: by name, owner or phone, across every active
// pharmacy on the platform (a warehouse's customers are not only the ones that
// already ordered through Feniq). Each result says which of THIS warehouse's
// reps has it now, if any.
async function searchPharmacies(warehouseId, { q } = {}) {
  const text = typeof q === 'string' ? q.trim() : '';
  if (text.length < 2) {
    throw ApiError.badRequest('Type at least 2 characters to search.', undefined, 'SEARCH_TOO_SHORT');
  }
  const pattern = new RegExp(escapeRegex(text.slice(0, 50)), 'i');
  const digits = text.replace(/\D/g, '');
  const or = [{ nameAr: pattern }, { nameEn: pattern }, { ownerName: pattern }];
  // Phones are stored as +9639... or 09...; the 9-digit tail matches both.
  if (digits.length >= 4) or.push({ phone: new RegExp(escapeRegex(digits.replace(/^(?:963|0)/, ''))) });

  const pharmacies = await Pharmacy.find({ isActive: true, $or: or })
    .select('nameAr nameEn ownerName address city areaType phone')
    .limit(SEARCH_LIMIT)
    .lean();
  const assignments = await RepAssignment.find({
    warehouseId,
    pharmacyId: { $in: pharmacies.map((p) => p._id) },
    active: true,
  })
    .select('pharmacyId repId')
    .lean();
  const reps = await Rep.find({ _id: { $in: assignments.map((a) => a.repId) } }).select('name').lean();
  const repName = new Map(reps.map((r) => [r._id.toString(), r.name]));
  const repByPharmacy = new Map(
    assignments.map((a) => [a.pharmacyId.toString(), { id: a.repId, name: repName.get(a.repId.toString()) }])
  );
  return pharmacies.map((pharmacy) => ({ pharmacy, currentRep: repByPharmacy.get(pharmacy._id.toString()) ?? null }));
}

// Gives a pharmacy to one of the warehouse's reps, moves it to another, or
// (repId null) takes it off whoever has it. The live row is closed, never
// rewritten, so the history of who covered the pharmacy stays.
async function assignPharmacy(warehouseId, actorUserId, pharmacyId, repId) {
  const pharmacyObjectId = assertObjectId(pharmacyId, 'INVALID_PHARMACY_ID');
  const pharmacy = await Pharmacy.findById(pharmacyObjectId).select('_id isActive').lean();
  if (!pharmacy) {
    throw ApiError.notFound('Pharmacy not found.', 'PHARMACY_NOT_FOUND');
  }
  let rep = null;
  if (repId !== null && repId !== undefined && repId !== '') {
    rep = await loadWarehouseRepOrThrow(warehouseId, repId);
    if (!rep.isActive) {
      throw ApiError.badRequest('This rep is switched off.', undefined, 'REP_INACTIVE');
    }
  }

  const current = await RepAssignment.findOne({ warehouseId, pharmacyId: pharmacyObjectId, active: true });
  if (current && rep && current.repId.equals(rep._id)) return current;

  try {
    return await runInTransaction(async (session) => {
      if (current) {
        await RepAssignment.updateOne(
          { _id: current._id, active: true },
          { $set: { active: false, endedAt: new Date() } },
          { session }
        );
      }
      if (!rep) return null;
      const [created] = await RepAssignment.create(
        [{ warehouseId, pharmacyId: pharmacyObjectId, repId: rep._id, assignedBy: actorUserId }],
        { session }
      );
      return created;
    });
  } catch (err) {
    // 11000: someone else assigned this pharmacy in the same moment.
    if (err && err.code === 11000) {
      throw ApiError.conflict('This pharmacy was just assigned. Please refresh.', 'ASSIGNMENT_CONFLICT');
    }
    throw err;
  }
}

async function listVisits(warehouseId, { repId, pharmacyId, limit, after } = {}) {
  const filter = { warehouseId };
  if (repId) filter.repId = assertObjectId(repId, 'INVALID_REP_ID');
  if (pharmacyId) filter.pharmacyId = assertObjectId(pharmacyId, 'INVALID_PHARMACY_ID');
  if (after) filter._id = { $lt: assertObjectId(after, 'INVALID_CURSOR') };
  const rows = await RepVisit.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const [reps, pharmacies] = await Promise.all([
    Rep.find({ _id: { $in: page.map((v) => v.repId) } }).select('name').lean(),
    Pharmacy.find({ _id: { $in: page.map((v) => v.pharmacyId) } }).select('nameAr nameEn').lean(),
  ]);
  const repById = new Map(reps.map((r) => [r._id.toString(), r]));
  const pharmacyById = new Map(pharmacies.map((p) => [p._id.toString(), p]));
  return {
    rows: page.map((visit) => ({
      visit,
      rep: repById.get(visit.repId.toString()) ?? null,
      pharmacy: pharmacyById.get(visit.pharmacyId.toString()) ?? null,
    })),
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]._id.toString() : null,
  };
}

// The QR for a pharmacy one of this warehouse's reps covers, so the warehouse
// (or its rep, in person) can print the sticker. Limited to its own assigned
// pharmacies rather than every pharmacy on the platform.
async function visitCodeForAssignedPharmacy(warehouseId, pharmacyId) {
  const pharmacyObjectId = assertObjectId(pharmacyId, 'INVALID_PHARMACY_ID');
  const assigned = await RepAssignment.exists({ warehouseId, pharmacyId: pharmacyObjectId, active: true });
  if (!assigned) {
    throw ApiError.forbidden('Assign this pharmacy to one of your reps first.', 'PHARMACY_NOT_ASSIGNED');
  }
  const pharmacy = await Pharmacy.findById(pharmacyObjectId).select('nameAr nameEn address').lean();
  const code = await pharmacyVisitCodes.getOrCreateVisitCode(pharmacyObjectId);
  return { pharmacy, code, qrPayload: pharmacyVisitCodes.qrPayloadFor(code) };
}

// The live assignment for an order being placed - order.service.js stamps the
// rep on the order from this. Lean and id-only: it sits on the order path.
async function activeRepIdFor(warehouseId, pharmacyId) {
  const assignment = await RepAssignment.findOne({ warehouseId, pharmacyId, active: true })
    .select('repId')
    .lean();
  return assignment ? assignment.repId : null;
}

module.exports = {
  createRep,
  updateRep,
  resetRepPassword,
  listReps,
  listRepPharmacies,
  searchPharmacies,
  assignPharmacy,
  listVisits,
  visitCodeForAssignedPharmacy,
  activeRepIdFor,
  pharmacyActivity,
};
