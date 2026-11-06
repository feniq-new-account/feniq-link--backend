// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { AdminOperationsOverview } from './AdminOperationsOverview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }),
}));
vi.mock('../api/client', () => ({ api: { adminDistributionOverview: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const example = {
  asOf: '2026-11-06T02:00:00.000Z',
  statuses: { planned: 2, in_progress: 1, completed: 4, cancelled: 0 },
  pendingStops: 3,
  activeListLimited: false,
  activeTrips: [{
    id: 'trip-1', driverName: 'Driver A', region: 'Kasab',
    driverAssigned: true, pendingStops: 3, totalStops: 5,
    gpsState: 'live', offRoute: true,
    gpsMeasuredAt: '2026-11-06T01:59:50.000Z',
  }],
};
let container, root;
beforeEach(() => {
  vi.clearAllMocks();
  api.adminDistributionOverview.mockResolvedValue({ overview: example });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function renderPanel() {
  await act(async () => root.render(
    <MemoryRouter><AdminOperationsOverview /></MemoryRouter>,
  ));
}

describe('admin operational fleet overview', () => {
  it('shows genuine counts, trip progress and fresh off-route alert', async () => {
    await renderPanel();
    expect(api.adminDistributionOverview).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Distribution operations');
    expect(container.textContent).toContain('Planned trips');
    expect(container.textContent).toContain('Pending stops');
    expect(container.textContent).toContain('Driver A');
    expect(container.textContent).toContain('Kasab');
    expect(container.textContent).toContain('3/5');
    expect(container.textContent).toContain('Off route');
    expect(container.querySelector('a[href="/admin/distribution"]')).not.toBeNull();
    expect(container.textContent).not.toContain('payments due');
  });

  it('never treats stale GPS or a failed refresh as live or off-route', async () => {
    api.adminDistributionOverview.mockResolvedValueOnce({
      overview: {
        ...example,
        activeTrips: [{ ...example.activeTrips[0],
          gpsState: 'stale', offRoute: false }],
      },
    });
    await renderPanel();
    expect(container.textContent).toContain('GPS stale');
    expect(container.textContent).not.toContain('Off route');
    api.adminDistributionOverview.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      container.querySelector('button').click();
    });
    expect(container.querySelector('[role="alert"]').textContent).toContain('Old GPS data');
    expect(container.textContent).not.toContain('GPS stale');
    expect(container.textContent).not.toContain('Off route');
  });

  it('displays a clear empty fleet state', async () => {
    api.adminDistributionOverview.mockResolvedValueOnce({
      overview: { ...example, statuses: { planned: 0, in_progress: 0, completed: 0, cancelled: 0 },
        pendingStops: 0, activeTrips: [] },
    });
    await renderPanel();
    expect(container.textContent).toContain('No active trips');
    expect(container.textContent).not.toContain('Driver A');
  });
});
