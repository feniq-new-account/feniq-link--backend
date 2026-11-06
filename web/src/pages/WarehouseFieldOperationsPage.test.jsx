// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { WarehouseFieldOperationsPage } from './WarehouseFieldOperationsPage';
import { api } from '../api/client';

vi.mock('../api/client', () => ({ api: { warehouseReps: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }) }));
vi.mock('../realtime/useRealtimeSync', () => ({
  REALTIME_EVENTS: { REP_VISIT_CREATED: 'rep-visit-created' },
  useRealtimeSync: () => {},
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;
const reps = [
  { id: 'rep1', name: 'Omar', isActive: true, pharmacyCount: 8,
    visits30d: 6, unverifiedVisits30d: 2, lastVisitAt: '2026-11-05T12:00:00.000Z',
    monthCommission: { repAmount: 999999 } },
  { id: 'rep2', name: 'Nour', isActive: true, pharmacyCount: 5,
    visits30d: 7, unverifiedVisits30d: 0, lastVisitAt: null },
  { id: 'rep3', name: 'Inactive', isActive: false, pharmacyCount: 2,
    visits30d: 0, unverifiedVisits30d: 0, lastVisitAt: null },
];
beforeEach(() => {
  vi.resetAllMocks();
  api.warehouseReps.mockResolvedValue({ reps });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function renderPage() {
  await act(async () => root.render(
    <MemoryRouter><WarehouseFieldOperationsPage /></MemoryRouter>,
  ));
}

describe('warehouse field manager dashboard', () => {
  it('aggregates only operational visits, never displaying commission amounts', async () => {
    await renderPage();
    expect(api.warehouseReps).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Active reps');
    expect(container.textContent).toContain('Verified visits (30 days)');
    expect(container.textContent).toContain('Unverified visits (30 days)');
    expect(container.textContent).toContain('Omar');
    expect(container.textContent).toContain('Nour');
    expect(container.textContent).toContain('Inactive');
    expect(container.querySelector('a[href="/warehouse/reps/rep1"]')).not.toBeNull();
    expect(container.textContent).not.toContain('999999');
    expect(container.textContent).not.toContain('Commission');
    expect([...container.querySelectorAll('.insights-kpis strong')].map(x=>x.textContent)).toEqual(['2', '13', '13', '2']);
  });

  it('filters to reps needing attention without erasing the warehouse visit totals', async () => {
    await renderPage();
    const filter = container.querySelector('input[type=checkbox]');
    await act(async () => {
      filter.click();
    });
    const rows = [...container.querySelectorAll('tbody tr')].map(x => x.textContent);
    expect(rows).toHaveLength(2); // Omar has unverified attempts; Nour has no visits yet.
    expect(rows.some(x => x.includes('Omar'))).toBe(true);
    expect(rows.some(x => x.includes('Nour'))).toBe(true);
    expect(rows.some(x => x.includes('Inactive'))).toBe(false);
  });

  it('hides stale activity after a request failure', async () => {
    await renderPage();
    api.warehouseReps.mockRejectedValueOnce(new Error('no connection'));
    await act(async () => container.querySelector('button').click());
    expect(container.querySelector('[role=alert]')).not.toBeNull();
    expect(container.textContent).not.toContain('Omar');
  });
});
