const test = require('node:test');
const assert = require('node:assert/strict');
const { distanceFromPolyline, routeAssessment } = require('../src/utils/distributionRouteDeviation');

test('route deviation is unknown until an explicit road polyline exists', () => {
  const fix = { latitude: 35, longitude: 35.1, accuracyMeters: 10 };
  assert.deepEqual(routeAssessment(fix, { routePoints: [] }), {
    state: 'unconfigured', distanceMeters: null, corridorMeters: null,
  });
  assert.deepEqual(routeAssessment(fix, { routePoints: [[35, 35.1]] }), {
    state: 'unconfigured', distanceMeters: null, corridorMeters: null,
  });
});

test('distance from explicit route corridor identifies a true detour', () => {
  const route = [[35, 35], [35, 35.1], [35, 35.2]];
  const exact = distanceFromPolyline(35, 35.1, route);
  assert.equal(exact, 0);
  const close = routeAssessment({
    latitude: 35.001, longitude: 35.1, accuracyMeters: 10,
  }, { routePoints: route, routeCorridorMeters: 300 });
  assert.equal(close.state, 'on_route');
  const deviation = routeAssessment({
    latitude: 35.012, longitude: 35.1, accuracyMeters: 20,
  }, { routePoints: route, routeCorridorMeters: 300 });
  assert.equal(deviation.state, 'off_route');
  assert.ok(deviation.distanceMeters > 1000);
});

test('uncertain GPS reading does not trigger a false off-route alarm', () => {
  const route = [[35, 35], [35, 35.2]];
  const uncertainty = routeAssessment({
    latitude: 35.003, longitude: 35.05, accuracyMeters: 110,
  }, { routePoints: route, routeCorridorMeters: 300 });
  assert.equal(uncertainty.state, 'on_route');
});

test('a route includes the entire road path, not just a straight endpoint segment', () => {
  const route = [[35, 35], [35.01, 35.01], [35, 35.02]];
  const nearBend = routeAssessment({
    latitude: 35.0099, longitude: 35.01, accuracyMeters: 15,
  }, { routePoints: route, routeCorridorMeters: 300 });
  assert.equal(nearBend.state, 'on_route');
});
