const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const Pharmacy = require('../models/pharmacy.model');
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

async function create(actorId, body = {}) {
  const region = string(body.region, 160, 'Region');
  const driverName = string(body.driverName, 160, 'Driver name');
  const driverPhone = body.driverPhone == null || body.driverPhone === ''
    ? '' : normalizePhone(body.driverPhone);
  if (driverPhone && !isValidPhone(driverPhone)) throw bad('Invalid driver phone.');
  const serviceDate = parseServiceDate(body.serviceDate);
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

async function transition(actorId, tripId, body, action) {
  id(tripId);
  const expected = revision(body?.revision);
  const now = new Date();
  return runInTransaction(async (session) => {
    const trip = await Trip.findById(tripId).session(session);
    if (!trip) throw ApiError.notFound('Trip not found.', 'DISTRIBUTION_TRIP_NOT_FOUND');
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
      { _id: tripId, revision: expected },
      { $set: patch, $inc: { revision: 1 } },
      { session, new: true }
    );
    if (!changed) {
      throw ApiError.conflict('Trip changed; refresh before saving.', 'DISTRIBUTION_TRIP_CHANGED');
    }
    await Event.create([{
      tripId, actorId, event, revision: expected + 1, stopId, note,
    }], { session });
    return changed;
  });
}

module.exports = { MAX_STOPS, create, get, list, transition, parseServiceDate };
