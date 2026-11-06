// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { projectTripRoute, TripRouteSketch } from './TripRouteSketch';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const route = [[35.51, 35.82], [35.52, 35.83], [35.53, 35.84]];

it('uses the saved GPX points, not computed roads, with geographic ordering', () => {
  const result = projectTripRoute(route, { latitude: 35.525, longitude: 35.835 });
  expect(result.route).toHaveLength(3);
  expect(result.location).toHaveLength(2);
  expect(result.route[0][1]).toBeGreaterThan(result.route[2][1]); // north is upward
  expect(result.route[0][0]).toBeLessThan(result.route[2][0]); // east is rightward
});

it('never silently bridges a malformed recorded route', () => {
  expect(projectTripRoute([[35.51,35.82],[99,35.83],[35.53,35.84]], null)).toBeNull();
  expect(projectTripRoute([[35.51,35.82]], null)).toBeNull();
  expect(projectTripRoute(null, null)).toBeNull();
});

it('missing or nonnumeric driver positions cannot create a fake GPS marker', () => {
  for (const coordinates of [null, {}, { latitude: null, longitude: null },
      { latitude: '35.5', longitude: '35.9' }]) {
    const result = projectTripRoute(route, coordinates);
    expect(result.location).toBeNull();
  }
});

it('shows a live position locally without requesting third-party map images', async () => {
  await act(async () => root.render(<TripRouteSketch routePoints={route}
    location={{ latitude: 35.525, longitude: 35.835 }}
    gpsState="live" arabic={false} />));
  expect(host.querySelectorAll('polyline')).toHaveLength(1);
  expect(host.querySelector('[aria-label="Recent driver location"]')).not.toBeNull();
  expect(host.textContent).toContain('NOT a street map');
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('iframe')).toBeNull();
});

it('shows stale GPS in grey and never marks it as current', async () => {
  await act(async () => root.render(<TripRouteSketch routePoints={route}
    location={{ latitude: 35.525, longitude: 35.835 }}
    gpsState="stale" arabic={false} />));
  expect(host.querySelector('[aria-label="Last known driver location"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Recent driver location"]')).toBeNull();
  expect(host.querySelector('circle[fill="#808080"]')).not.toBeNull();
});
