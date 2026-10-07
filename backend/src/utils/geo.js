// Great-circle distance in meters between two [longitude, latitude] points
// (the GeoJSON order Pharmacy.location and RepVisit.coordinates use).
const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function distanceMeters([lng1, lat1], [lng2, lat2]) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function isValidCoordinate(lng, lat) {
  return (
    Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
  );
}

module.exports = { distanceMeters, isValidCoordinate };
