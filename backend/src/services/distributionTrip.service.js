const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const Pharmacy = require('../models/pharmacy.model');
const User = require('../models/user.model');
const Rep = require('../models/rep.model');
const Trip = require('../models/distributionTrip.model');
const Event = require('../models/distributionTripEvent.model');

const MAX_STOPS = 50;
const STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];
const bad = (message) => ApiError.badRequest(message, undefined, 'INVALID_DISTRIBUTION_TRIP');

function id(value) {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) {
    throw bad('Invalid id.');
  }
  return value;
}
function string(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw bad(label + ' must be a nonempty string of at most ' + max + ' characters.');
  }
  return value.trim();
}
function optionalNote(value) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 500) throw bad('Invalid note.');
  return value.trim();
}
function driverRequestId(value) {
  if (value === undefined) return null; // Legacy clients remain compatible.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{12,96}$/.test(value)) {
    throw bad('Driver stop requestId must be 12–96 URL-safe characters.');
  }
  return value;
}
function revision(value) {
  if (!Number.isInteger(value) || value < 0) throw bad('Expected current trip revision.');
  return value;
}
function parseServiceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad('Invalid service date.');
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw bad('Invalid service date.');
  }
  return parsed;
}

async function validateDriver(driverUserId) {
  if (driverUserId == null || driverUserId === '') return null;
  id(driverUserId);
  const user = await User.findById(driverUserId).select('role status name phone').lean();
  if (!user || user.status !== 'active' || !['rep', 'driver'].includes(user.role) ||
      (user.role === 'rep' && !await Rep.exists({ userId: user._id, isActive: true }))) {
    throw bad('Driver must have an active driver account or field rep profile.');
  }
  return user;
}

async function create(actorId, body = {}) {
  const region = string(body.region, 160, 'Region');
  const driverName = string(body.driverName, 160, 'Driver name');
  const driverPhone = body.driverPhone == null || body.driverPhone === ''
    ? '' : normalizePhone(body.driverPhone);
  if (driverPhone && !isValidPhone(driverPhone)) throw bad('Invalid driver phone.');
  const serviceDate = parseServiceDate(body.serviceDate);
  const driver = await validateDriver(body.driverUserId);
  if (!Array.isArray(body.pharmacyIds) || body.pharmacyIds.length < 1 ||
      body.pharmacyIds.length > MAX_STOPS) throw bad('Choose 1 to 50 pharmacy stops.');
  const ids = body.pharmacyIds.map(id);
  if (new Set(ids).size !== ids.length) throw bad('Duplicate pharmacy stops are not allowed.');

  // Snapshot names and addresses at planning time. Route order is the
  // manually supplied order; no routing algorithm, money, or order writes.
  const pharmacies = await Pharmacy.find({
    _id: { $in: ids }, isActive: true,
  }).select('nameAr address').lean();
  const byId = new Map(pharmacies.map(p => [String(p._id), p]));
  if (byId.size !== ids.length) throw bad('Every stop must be an active pharmacy.');
  const stops = ids.map(pharmacyId => {
    const pharmacy = byId.get(pharmacyId);
    return {
      pharmacyId, pharmacyName: pharmacy.nameAr, address: pharmacy.address,
      status: 'pending',
    };
  });

  return runInTransaction(async (session) => {
    const [trip] = await Trip.create([{
      region, driverName, driverPhone, serviceDate, stops, createdBy: actorId,
      driverUserId: driver?._id || null,
    }], { session });
    await Event.create([{ tripId: trip._id, actorId,
      event: 'created', revision: 0 }], { session });
    return trip;
  });
}

async function get(tripId) {
  const trip = await Trip.findById(id(tripId)).lean();
  if (!trip) throw ApiError.notFound('Trip not found.', 'DISTRIBUTION_TRIP_NOT_FOUND');
  return trip;
}

async function list({ status, after, limit = 20 } = {}) {
  if (status && !STATUSES.includes(status)) throw bad('Invalid trip status.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw bad('Invalid page size.');
  const filter = { ...(status ? { status } : {}) };
  if (after) filter._id = { $lt: new mongoose.Types.ObjectId(id(after)) };
  const rows = await Trip.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const trips = hasMore ? rows.slice(0, limit) : rows;
  return {
    trips,
    pagination: { hasMore, nextCursor: hasMore ? String(trips[trips.length - 1]._id) : null },
  };
}

async function transition(actorId, tripId, body, action, { driverUserId = null } = {}) {
  id(tripId);
  const expected = revision(body?.revision);
  // Only driver stop decisions accept an idempotency key, never money or orders.
  const requestId = driverUserId && action === 'stop' ? driverRequestId(body?.requestId) : null;
  const now = new Date();
  return runInTransaction(async (session) => {
    const trip = await Trip.findById(tripId).session(session);
    if (!trip) throw ApiError.notFound('Trip not found.', 'DISTRIBUTION_TRIP_NOT_FOUND');
    if (driverUserId && String(trip.driverUserId) !== String(driverUserId)) {
      throw ApiError.forbidden('Trip is not assigned to this driver.', 'DRIVER_TRIP_FORBIDDEN');
    }
    if (requestId) {
      // The device may retry after the first write committed but its reply was lost.
      // Verify the exact same actor, stop, decision, note AND original revision.
      const stopId = id(body?.stopId);
      const decision = body?.status;
      const note = optionalNote(body?.note);
      if (!['delivered', 'failed'].includes(decision) || (decision === 'failed' && !note)) {
        throw bad('Invalid driver stop decision.');
      }
      const prior = await Event.findOne({ tripId: trip._id, actorId, requestId }).session(session).lean();
      if (prior) {
        const same = prior.revision === expected + 1 && String(prior.stopId) === stopId &&
          prior.event === (decision === 'delivered' ? 'stop_delivered' : 'stop_failed') &&
          prior.note === note;
        if (!same) {
          throw ApiError.conflict('Request ID was already used for a different stop decision.',
            'DRIVER_REQUEST_ID_REUSED');
        }
        return trip; // Return current trip state; never append a second audit event.
      }
    }
    if (trip.revision !== expected) {
      throw ApiError.conflict('Trip changed; refresh before saving.', 'DISTRIBUTION_TRIP_CHANGED');
    }
    const patch = {};
    let event = action, stopId = null, note = '';
    if (action === 'started') {
      if (trip.status !== 'planned') throw bad('Only planned trips may start.');
      Object.assign(patch, { status: 'in_progress', startedAt: now });
    } else if (action === 'completed') {
      if (trip.status !== 'in_progress' ||
          trip.stops.some(s => s.status === 'pending')) {
        throw bad('Finish each stop before completing the trip.');
      }
      Object.assign(patch, { status: 'completed', endedAt: now });
    } else if (action === 'cancelled') {
      if (!['planned', 'in_progress'].includes(trip.status)) throw bad('Trip cannot be cancelled.');
      note = string(body?.reason, 500, 'Cancellation reason');
      Object.assign(patch, { status: 'cancelled', endedAt: now, cancellationReason: note });
    } else if (action === 'stop') {
      if (trip.status !== 'in_progress') throw bad('Start the trip before updating stops.');
      stopId = id(body?.stopId);
      const position = trip.stops.findIndex(s => String(s._id) === stopId);
      if (position < 0) throw ApiError.notFound('Stop not found.', 'DISTRIBUTION_STOP_NOT_FOUND');
      if (trip.stops[position].status !== 'pending') throw bad('Stop was already resolved.');
      if (!['delivered', 'failed'].includes(body?.status)) throw bad('Invalid stop status.');
      note = optionalNote(body.note);
      if (body.status === 'failed' && !note) throw bad('Failure reason is required.');
      patch['stops.' + position + '.status'] = body.status;
      patch['stops.' + position + '.note'] = note;
      patch['stops.' + position + '.decidedAt'] = now;
      event = body.status === 'delivered' ? 'stop_delivered' : 'stop_failed';
    } else {
      throw bad('Invalid trip action.');
    }
    const changed = await Trip.findOneAndUpdate(
      { _id: tripId, revision: expected, ...(driverUserId ? { driverUserId } : {}) },
      { $set: patch, $inc: { revision: 1 } },
      { session, new: true }
    );
    if (!changed) {
      throw ApiError.conflict('Trip changed; refresh before saving.', 'DISTRIBUTION_TRIP_CHANGED');
    }
    await Event.create([{
      tripId, actorId, event, revision: expected + 1, stopId, note,
      ...(requestId ? { requestId } : {}),
    }], { session });
    return changed;
  });
}

async function assignDriver(actorId, tripId, body = {}) {
  id(tripId);
  const expected = revision(body.revision);
  // Assigning a different driver is an admin-only action; never trust a
  // driver-supplied account id. The endpoint is guarded separately.
  const driver = await validateDriver(body.driverUserId);
  if (!driver) throw bad('Choose a driver account.');
  return runInTransaction(async (session) => {
    const trip = await Trip.findById(tripId).session(session);
    if (!trip) throw ApiError.notFound('Trip not found.', 'DISTRIBUTION_TRIP_NOT_FOUND');
    if (trip.revision !== expected) throw ApiError.conflict('Trip changed; refresh.', 'DISTRIBUTION_TRIP_CHANGED');
    if (trip.status !== 'planned') throw bad('Driver assignment is locked once a trip starts.');
    const updated = await Trip.findOneAndUpdate(
      { _id: tripId, revision: expected, status: 'planned' },
      { $set: { driverUserId: driver._id, driverName: driver.name, driverPhone: driver.phone },
        $inc: { revision: 1 } },
      { session, new: true }
    );
    if (!updated) throw ApiError.conflict('Trip changed; refresh.', 'DISTRIBUTION_TRIP_CHANGED');
    await Event.create([{ tripId: trip._id, actorId, event: 'driver_assigned',
      revision: expected + 1 }], { session });
    return updated;
  });
}

async function assertActiveTripDriver(userId) {
  const user = await User.findById(userId).select('role status').lean();
  if (!user || user.status !== 'active') {
    throw ApiError.forbidden('Active driver account required.', 'DRIVER_INACTIVE');
  }
  if (user.role === 'driver') return;
  if (user.role === 'rep' && await Rep.exists({ userId, isActive: true })) return;
  throw ApiError.forbidden('Active field rep profile required.', 'REP_INACTIVE');
}

async function driverTrips(userId) {
  await assertActiveTripDriver(userId);
  // Narrow projection: no unrelated pharmacies' commercial/order data.
  return Trip.find({ driverUserId: userId, status: { $in: ['planned', 'in_progress'] } })
    .sort({ serviceDate: 1, _id: 1 }).limit(40).lean();
}

async function driverTrip(userId, tripId) {
  await assertActiveTripDriver(userId);
  id(tripId);
  const trip = await Trip.findOne({ _id: tripId, driverUserId: userId }).lean();
  if (!trip) throw ApiError.notFound('Assigned trip not found.', 'DRIVER_TRIP_NOT_FOUND');
  return trip;
}

async function driverTransition(userId, tripId, body, action) {
  await assertActiveTripDriver(userId);
  return transition(userId, tripId, body, action, { driverUserId: userId });
}

async function listDrivers() {
  // Operational directory only: external drivers have NO rep or financial access.
  const users = await User.find({ role: { $in: ['rep', 'driver'] }, status: 'active' })
    .select('_id name phone role').sort({ _id: -1 }).limit(100).lean();
  if (!users.length) return [];
  const reps = users.filter(u => u.role === 'rep');
  const enabled = reps.length ? await Rep.find({
    userId: { $in: reps.map(u => u._id) }, isActive: true,
  }).select('userId').lean() : [];
  const allowed = new Set(enabled.map(r => String(r.userId)));
  return users.filter(u => u.role === 'driver' || allowed.has(String(u._id))).map(u => ({
    userId: u._id, name: u.name, phone: u.phone, role: u.role,
  }));
}

async function setPlannedRoute(actorId, tripId, body = {}) {
  id(tripId);
  const expected = revision(body.revision);
  const points = body.routePoints;
  if (!Array.isArray(points) || points.length < 2 || points.length > 500 ||
      points.some(p => !Array.isArray(p) || p.length !== 2 ||
        typeof p[0] !== 'number' || !Number.isFinite(p[0]) || p[0] < -90 || p[0] > 90 ||
        typeof p[1] !== 'number' || !Number.isFinite(p[1]) || p[1] < -180 || p[1] > 180)) {
    throw bad('Provide 2 to 500 valid latitude, longitude route coordinates.');
  }
  const corridor = body.routeCorridorMeters ?? 300;
  if (!Number.isInteger(corridor) || corridor < 100 || corridor > 2000) {
    throw bad('Route corridor must be between 100 and 2000 meters.');
  }
  return runInTransaction(async session => {
    const trip = await Trip.findById(tripId).session(session);
    if (!trip) throw ApiError.notFound('Trip not found.', 'DISTRIBUTION_TRIP_NOT_FOUND');
    if (trip.revision !== expected) throw ApiError.conflict('Trip changed; refresh.', 'DISTRIBUTION_TRIP_CHANGED');
    // Only configure the actual road polyline BEFORE the driver starts.
    if (trip.status !== 'planned') throw bad('Cannot change a route after trip start.');
    const result = await Trip.findOneAndUpdate(
      { _id: tripId, status: 'planned', revision: expected },
      { $set: { routePoints: points, routeCorridorMeters: corridor },
        $inc: { revision: 1 } },
      { session, new: true, runValidators: true }
    );
    if (!result) throw ApiError.conflict('Trip changed; refresh.', 'DISTRIBUTION_TRIP_CHANGED');
    return result;
  });
}

module.exports = {
  MAX_STOPS, create, get, list, transition, parseServiceDate,
  assignDriver, driverTrips, driverTrip, driverTransition, listDrivers, setPlannedRoute,
};
