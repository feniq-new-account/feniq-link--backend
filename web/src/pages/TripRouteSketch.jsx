import { useMemo } from 'react';

// A deliberately provider-free schematic of the real GPX polyline.
// This is NOT a street map: no routing is inferred and no driver coordinate
// leaves the admin browser during passive rendering.
export function projectTripRoute(routePoints, location) {
  const valid = point => Array.isArray(point) && point.length === 2 &&
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
  // Reject malformed points rather than silently skipping one and drawing
  // an invented connector across the gap.
  if (!Array.isArray(routePoints) || routePoints.length < 2 ||
      routePoints.length > 500 || !routePoints.every(valid)) return null;
  const route = routePoints;
  const pos = Number.isFinite(Number(location?.latitude)) &&
    Number.isFinite(Number(location?.longitude)) &&
    Math.abs(Number(location?.latitude)) <= 90 &&
    Math.abs(Number(location?.longitude)) <= 180
    ? [Number(location.latitude), Number(location.longitude)] : null;

  const avgLat = route.reduce((sum, p) => sum + p[0], 0) / route.length;
  const xScale = Math.max(0.01, Math.cos(avgLat * Math.PI / 180));
  const toXY = ([lat, lon]) => [lon * xScale, -lat];
  const all = [...route, ...(pos ? [pos] : [])].map(toXY);
  const minX = Math.min(...all.map(p => p[0]));
  const maxX = Math.max(...all.map(p => p[0]));
  const minY = Math.min(...all.map(p => p[1]));
  const maxY = Math.max(...all.map(p => p[1]));
  const width = Math.max(maxX - minX, 0.00001);
  const height = Math.max(maxY - minY, 0.00001);
  const factor = Math.min(336 / width, 180 / height);
  const offsetX = 24 + (336 - (maxX - minX) * factor) / 2;
  const offsetY = 20 + (180 - (maxY - minY) * factor) / 2;
  const point = (p) => {
    const [x, y] = toXY(p);
    return [offsetX + (x - minX) * factor, offsetY + (y - minY) * factor];
  };
  return {
    route: route.map(point),
    location: pos ? point(pos) : null,
  };
}

export function TripRouteSketch({ routePoints, location, gpsState, arabic = true }) {
  const geometry = useMemo(() =>
    projectTripRoute(routePoints, location), [routePoints, location]);
  if (!geometry) return null;

  const live = gpsState === 'live';
  const path = geometry.route.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  const marker = geometry.location;
  const tr = (ar, en) => arabic ? ar : en;
  return (
    <figure className="trip-route-sketch" style={{
      margin: '12px 0', padding: 12, border: '1px solid var(--border, #d1d5db)',
      borderRadius: 12, maxWidth: 600,
    }}>
      <svg viewBox="0 0 384 220" width="100%" role="img"
        aria-label={tr('رسم تخطيطي لاتجاه خط الرحلة المسجّل ونقطة السائق',
          'Schematic of recorded route and driver position')}>
        <rect x="0" y="0" width="384" height="220" rx="12" fill="transparent" />
        <polyline points={path} fill="none" stroke="#1b667e"
          strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={geometry.route[0][0]} cy={geometry.route[0][1]} r="5"
          fill="#18a78d" aria-label="Recorded route start" />
        <rect x={geometry.route.at(-1)[0]-5} y={geometry.route.at(-1)[1]-5}
          width="10" height="10" fill="#1b667e" aria-label="Recorded route end" />
        {marker && <circle cx={marker[0]} cy={marker[1]} r="7"
          fill={live ? '#ed6b27' : '#808080'} stroke="white" strokeWidth="2"
          aria-label={live ? 'Recent driver location' : 'Last known driver location'} />}
        <text x="364" y="21" textAnchor="middle" fontSize="12" fill="currentColor">N</text>
        <path d="M364 27 L359 39 L369 39 Z" fill="currentColor" />
      </svg>
      <figcaption style={{ fontSize: 12 }}>
        {tr(
          'مخطط للخط المسجّل (GPX)، وليس خريطة شوارع أو طريقاً محسوباً. الدائرة البرتقالية = موقع حديث، الرمادية = آخر موقع معروف.',
          'Recorded GPX shape, NOT a street map or computed route. Orange dot = recent fix; grey = last known fix.',
        )}
      </figcaption>
    </figure>
  );
}
