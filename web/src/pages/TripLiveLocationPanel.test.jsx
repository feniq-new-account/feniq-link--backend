// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TripLiveLocationPanel } from './TripLiveLocationPanel';
import { api } from '../api/client';

vi.mock('../api/client', () => ({ api: {
  adminTripLiveLocation: vi.fn(),
  adminSaveTripRoute: vi.fn(),
}}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, host;
const activeTrip = { _id: 'trip-1', status: 'in_progress', revision: 2 };
beforeEach(async () => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
function button(name) {
  return [...host.querySelectorAll('button')].find(x => x.textContent.includes(name));
}
it('shows an outside-route alert and preserves a live map link for the detouring driver', async () => {
  api.adminTripLiveLocation.mockResolvedValue({ location: {
    state: 'live',
    location: { latitude: 35.1, longitude: 35.2, accuracyMeters: 12,
      receivedAt: '2026-11-06T00:00:00Z' },
    deviation: { state: 'off_route', distanceMeters: 1400, corridorMeters: 300 },
  } });
  await act(async () => root.render(<TripLiveLocationPanel trip={activeTrip} arabic={false} />));
  expect(api.adminTripLiveLocation).not.toHaveBeenCalled();
  await act(async () => button('Monitor live driver position').click());
  expect(host.textContent).toContain('Driver is outside the planned route');
  const link = host.querySelector('a');
  expect(link.href).toContain('mlat=35.1');
  expect(link.href).toContain('mlon=35.2');
});

it('marks a disconnected driver as stale, not as off-route', async () => {
  api.adminTripLiveLocation.mockResolvedValue({ location: {
    state: 'stale', location: {
      latitude: 35.1, longitude: 35.2, accuracyMeters: 15,
      receivedAt: '2026-11-06T00:00:00Z',
    }, deviation: null,
  } });
  await act(async () => root.render(<TripLiveLocationPanel trip={activeTrip} arabic={false} />));
  await act(async () => button('Monitor live driver position').click());
  expect(host.textContent).toContain('last known position');
  expect(host.textContent).not.toContain('outside the planned route');
  expect(host.querySelector('a')).not.toBeNull();
});

it('route configuration is available only before a trip begins', async () => {
  const planned = { _id: 'trip-2', status: 'planned', revision: 1 };
  await act(async () => root.render(<TripLiveLocationPanel trip={planned} arabic={false} />));
  expect(host.textContent).toContain('Set actual route geometry');
  expect(api.adminTripLiveLocation).not.toHaveBeenCalled();
  expect(button('Monitor live driver position')).toBeUndefined();
});
