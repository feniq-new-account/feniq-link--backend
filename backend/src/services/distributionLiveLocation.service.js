const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const Trip = require('../models/distributionTrip.model');
const Rep = require('../models/rep.model');
const Location = require('../models/distributionLiveLocation.model');
const { routeAssessment } = require('../utils/distributionRouteDeviation');

const MIN_INTERVAL_MS = 15 * 1000;
const MAX_MEASUREMENT_AGE_MS = 2 * 60 * 1000;
const FUTURE_SKEW_MS = 30 * 1000;
const TTL_MS = 60 * 60 * 1000;

function id(value) {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) {
    throw ApiError.badRequest('Invalid trip id.', undefined, 'INVALID_DISTRIBUTION_TRIP');
  }
  return value;
}
function validateReading(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('Invalid location.', undefined, 'INVALID_DRIVER_LOCATION');
  }
  const { latitude, longitude, accuracyMeters, measuredAt } = body;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) ||
      latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) ||
      longitude < -180 || longitude > 180 ||
      typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) ||
      accuracyMeters < 0 || accuracyMeters > 150) {
    throw ApiError.badRequest('Invalid GPS coordinates or accuracy.', undefined, 'INVALID_DRIVER_LOCATION');
  }
  if (typeof measuredAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(measuredAt)) {
    throw ApiError.badRequest('GPS timestamp required.', undefined, 'INVALID_DRIVER_LOCATION');
  }
  const measured = new Date(measuredAt);
  const age = now.getTime() - measured.getTime();
  if (Number.isNaN(age) || age > MAX_MEASUREMENT_AGE_MS || age < -FUTURE_SKEW_MS) {
    throw ApiError.badRequest('GPS position is stale or in the future.', undefined, 'STALE_DRIVER_LOCATION');
  }
  return { latitude, longitude, accuracyMeters, measuredAt: measured };
}

async function assertTripAccess(tripId, userId) {
  const [trip, rep] = await Promise.all([
    Trip.findById(id(tripId)).select('_id driverUserId status').lean(),
    Rep.exists({ userId, isActive: true }),
  ]);
  if (!rep || !trip || String(trip.driverUserId) !== String(userId)) {
    throw ApiError.forbidden('Trip not assigned to this driver.', 'DRIVER_TRIP_FORBIDDEN');
  }
  if (trip.status !== 'in_progress') {
    throw ApiError.forbidden('GPS is only allowed during an active trip.', 'DRIVER_GPS_TRIP_NOT_ACTIVE');
  }
  return trip;
}

// Called only from a foreground driver interaction that explicitly enables
// tracking. The backend stores a single most recent fix, never a trail.
async function update(driverUserId, tripId, body) {
  const now = new Date();
  const gps = validateReading(body, now);
  const trip = await assertTripAccess(tripId, driverUserId);
  await Location.init();
  try {
    const updated = await Location.findOneAndUpdate(
      {
        tripId: trip._id,
        $or: [
          { receivedAt: { $lte: new Date(now.getTime() - MIN_INTERVAL_MS) } },
          { receivedAt: { $exists: false } },
        ],
      },
      {
        $set: {
          driverUserId, ...gps, receivedAt: now,
          expiresAt: new Date(now.getTime() + TTL_MS),
        },
        $setOnInsert: { tripId: trip._id },
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    return {
      receivedAt: updated.receivedAt,
      expiresAt: updated.expiresAt,
    };
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.tooManyRequests('GPS updates must be at least 15 seconds apart.', 'GPS_TOO_FREQUENT');
    }
    throw err;
  }
}

async function readForAdmin(tripId) {
  const trip = await Trip.findById(id(tripId))
    .select('_id status driverUserId routePoints routeCorridorMeters').lean();
  if (!trip) throw ApiError.notFound('Trip not found.', 'DISTRIBUTION_TRIP_NOT_FOUND');
  if (trip.status !== 'in_progress') return null;
  const position = await Location.findOne({
    tripId: trip._id,
    driverUserId: trip.driverUserId,
    expiresAt: { $gt: new Date() },
  }).select('latitude longitude accuracyMeters measuredAt receivedAt -_id').lean();
  if (!position) return { state: 'no_signal', location: null, deviation: null };
  const now = Date.now();
  const receivedAge = now - new Date(position.receivedAt).getTime();
  const measuredAge = now - new Date(position.measuredAt).getTime();
  // A delayed measurement must never look live just because it arrived recently.
  // Retain the LAST KNOWN point without producing an active deviation alert.
  if (receivedAge > MAX_MEASUREMENT_AGE_MS || measuredAge > MAX_MEASUREMENT_AGE_MS) {
    return { state: 'stale', location: position, deviation: null };
  }
  return {
    state: 'live', location: position,
    deviation: routeAssessment(position, trip),
  };
}

module.exports = { update, readForAdmin, MIN_INTERVAL_MS, TTL_MS };
