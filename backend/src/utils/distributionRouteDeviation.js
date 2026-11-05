// Distance to the closest segment of an EXPLICIT planned road route.
// Points are [latitude, longitude] degrees. Equirectangular approximation is
// adequate for comparing nearby points within one delivery district.
// The result is not a driving distance or route ETA.
const METERS_PER_RADIAN = 6371000;

function distanceFromPolyline(latitude, longitude, points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const latRadians = latitude * Math.PI / 180;
  const cos = Math.cos(latRadians);
  const xy = ([lat, lon]) => [
    (lon - longitude) * Math.PI / 180 * cos * METERS_PER_RADIAN,
    (lat - latitude) * Math.PI / 180 * METERS_PER_RADIAN,
  ];
  let shortest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = xy(points[i - 1]);
    const [bx, by] = xy(points[i]);
    const dx = bx - ax, dy = by - ay;
    const lenSquared = dx * dx + dy * dy;
    const t = lenSquared === 0 ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSquared));
    const x = ax + t * dx, y = ay + t * dy;
    shortest = Math.min(shortest, Math.hypot(x, y));
  }
  return Math.round(shortest);
}

function routeAssessment(position, trip) {
  if (!position || !Array.isArray(trip.routePoints) || trip.routePoints.length < 2) {
    return { state: 'unconfigured', distanceMeters: null, corridorMeters: null };
  }
  const distanceMeters = distanceFromPolyline(position.latitude, position.longitude, trip.routePoints);
  const corridorMeters = trip.routeCorridorMeters || 300;
  // A location fix of low accuracy should not falsely trigger a detour alert.
  const offRoute = distanceMeters - position.accuracyMeters > corridorMeters;
  return {
    state: offRoute ? 'off_route' : 'on_route',
    distanceMeters, corridorMeters,
  };
}
module.exports = { distanceFromPolyline, routeAssessment };
