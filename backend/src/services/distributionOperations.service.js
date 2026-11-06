const Trip = require('../models/distributionTrip.model');
const liveLocation = require('./distributionLiveLocation.service');

// An operational read model only. No orders, amounts, debts or payments.
// Counts are global because only a platform admin can access this route.
const ACTIVE_LIMIT = 8;
const STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

async function overview() {
  const now = new Date();
  const [grouped, activeTrips, remaining] = await Promise.all([
    Trip.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Trip.find({ status: 'in_progress' })
      .sort({ serviceDate: 1, _id: 1 })
      .select('_id region driverName driverUserId serviceDate revision stops')
      .limit(ACTIVE_LIMIT)
      .lean(),
    Trip.aggregate([
      { $match: { status: 'in_progress' } },
      { $unwind: '$stops' },
      { $match: { 'stops.status': 'pending' } },
      { $count: 'count' },
    ]),
  ]);
  const statuses = Object.fromEntries(STATUSES.map(status => [status, 0]));
  for (const { _id, count } of grouped) {
    if (Object.hasOwn(statuses, _id)) statuses[_id] = count;
  }

  const readings = await Promise.allSettled(activeTrips.map(trip =>
    liveLocation.readForAdmin(String(trip._id))
  ));
  const trips = activeTrips.map((trip, i) => {
    const reading = readings[i].status === 'fulfilled' ? readings[i].value : null;
    const gpsState = reading?.state ?? 'unavailable';
    const position = reading?.location;
    const deviation = gpsState === 'live' ? reading?.deviation : null;
    return {
      id: String(trip._id),
      region: trip.region,
      driverName: trip.driverName,
      driverAssigned: Boolean(trip.driverUserId),
      serviceDate: trip.serviceDate,
      pendingStops: trip.stops.filter(stop => stop.status === 'pending').length,
      totalStops: trip.stops.length,
      revision: trip.revision,
      gpsState,
      gpsMeasuredAt: position?.measuredAt ?? null,
      offRoute: deviation?.state === 'off_route',
    };
  });
  return {
    asOf: now.toISOString(),
    statuses,
    pendingStops: remaining[0]?.count ?? 0,
    activeTrips: trips,
    activeListLimited: statuses.in_progress > ACTIVE_LIMIT,
  };
}
module.exports = { overview, ACTIVE_LIMIT };
