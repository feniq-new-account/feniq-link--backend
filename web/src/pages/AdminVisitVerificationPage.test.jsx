// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminVisitVerificationPage } from './AdminVisitVerificationPage';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../api/client', () => ({ api: { getVisitVerification: vi.fn(), saveVisitVerification: vi.fn(),
  listAdminPharmacyLocations: vi.fn(), saveAdminPharmacyLocation: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const policy = { radiusMeters: 150, maxAccuracyMeters: 100, maxAgeSeconds: 120, version: 3 };
const pharmacy = { id: 'p1', nameAr: 'صيدلية الشفاء', city: 'Latakia', address: 'Street 2', phone: '0944000001',
  location: { coordinates: [35.7915, 35.5196] }, approval: 'pending', version: 5 };
beforeEach(async () => {
  vi.clearAllMocks();
  api.getVisitVerification.mockResolvedValue({ policy });
  api.listAdminPharmacyLocations.mockResolvedValue({ pharmacies: [pharmacy], pagination: { hasMore: false } });
  api.saveVisitVerification.mockResolvedValue({ policy: { ...policy, version: 4 } });
  api.saveAdminPharmacyLocation.mockResolvedValue({ pharmacy: { ...pharmacy, version: 6 } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<AdminVisitVerificationPage />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('sends separate radius/uncertainty/age constraints with stale-write version', async () => {
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.saveVisitVerification).toHaveBeenCalledWith(policy);
});
it('approves the correct point using GeoJSON longitude/latitude order and keeps its version', async () => {
  const form = host.querySelectorAll('form')[1];
  await act(async () => {
    form.querySelector('select').value = 'approved';
    form.querySelector('select').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.saveAdminPharmacyLocation).toHaveBeenCalledWith('p1', {
    latitude: 35.5196, longitude: 35.7915, approval: 'approved', version: 5,
  });
  expect(host.querySelector('a').href).toContain('mlat=35.5196&mlon=35.7915');
});
it('a conflicting edit preserves entered coordinates and exposes the server message', async () => {
  api.saveAdminPharmacyLocation.mockRejectedValue(new Error('Location changed. Reload.'));
  await act(async () => host.querySelectorAll('form')[1].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="alert"]').textContent).toBe('Location changed. Reload.');
  expect(host.querySelectorAll('form')[1].querySelector('input').value).toBe('35.5196');
});
