// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminPharmacyLicencesPage } from './AdminPharmacyLicencesPage';
import { api } from '../api/client';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }),
}));
vi.mock('../api/client', () => ({ api: {
  listAdminPharmacyLicences: vi.fn(),
  reviewAdminPharmacyLicence: vi.fn(),
  downloadAdminPharmacyLicence: vi.fn(),
}}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const row = {
  pharmacyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  pharmacyName: 'Example Pharmacy',
  ownerName: 'Owner',
  phone: '0931000002',
  revision: 1,
  mimeType: 'image/png',
  submittedAt: '2026-11-05T09:00:00Z',
};

beforeEach(async () => {
  vi.clearAllMocks();
  api.listAdminPharmacyLicences.mockResolvedValue({
    items: [row], pagination: { hasMore: false, nextCursor: null },
  });
  api.reviewAdminPharmacyLicence.mockResolvedValue({ success: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<AdminPharmacyLicencesPage />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function button(label) {
  return [...host.querySelectorAll('button')].find(b => b.textContent.includes(label));
}

it('lists only pending private review metadata and does not fetch images while loading', () => {
  expect(host.textContent).toContain('Example Pharmacy');
  expect(button('Download document')).toBeTruthy();
  expect(api.downloadAdminPharmacyLicence).not.toHaveBeenCalled();
});

it('a rejection without a reason never sends a review decision', async () => {
  vi.spyOn(window, 'prompt').mockReturnValue('  ');
  await act(async () => button('Reject with reason').click());
  expect(api.reviewAdminPharmacyLicence).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Rejection reason is required');
});

it('administrator can approve a pending licence', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await act(async () => button('Approve').click());
  expect(api.reviewAdminPharmacyLicence).toHaveBeenCalledWith(
    row.pharmacyId, 'approved', '');
  expect(api.listAdminPharmacyLicences).toHaveBeenCalledTimes(2);
});

it('rejection sends the entered reason to the authenticated endpoint', async () => {
  vi.spyOn(window, 'prompt').mockReturnValue('Please take another photo');
  await act(async () => button('Reject with reason').click());
  expect(api.reviewAdminPharmacyLicence).toHaveBeenCalledWith(
    row.pharmacyId, 'rejected', 'Please take another photo');
});

it('deduplicates licence rows across cursor pages', async () => {
  const next = { ...row, pharmacyId: 'bbbbbbbbbbbbbbbbbbbbbbbb', pharmacyName: 'Second Pharmacy' };
  api.listAdminPharmacyLicences.mockResolvedValueOnce({
    items: [row], pagination: { hasMore: true, nextCursor: 'cursor1' },
  });
  await act(async () => button('Refresh').click());
  api.listAdminPharmacyLicences.mockResolvedValueOnce({
    items: [row, next], pagination: { hasMore: false, nextCursor: null },
  });
  await act(async () => button('Load more').click());
  expect(api.listAdminPharmacyLicences).toHaveBeenLastCalledWith({ after: 'cursor1' });
  expect(host.querySelectorAll('.reg-card-body > .adm-card')).toHaveLength(2);
  expect(host.textContent).toContain('Second Pharmacy');
});

it('a stale load-more result cannot reinsert a licence that was just approved', async () => {
  api.listAdminPharmacyLicences.mockResolvedValueOnce({
    items: [row], pagination: { hasMore: true, nextCursor: 'cursor1' },
  });
  await act(async () => button('Refresh').click());
  let finishOldPage;
  api.listAdminPharmacyLicences.mockImplementationOnce(() =>
    new Promise(resolve => { finishOldPage = resolve; }));
  const oldPage = act(async () => button('Load more').click());
  // Wait until the pending page request starts without awaiting its response.
  await act(async () => { await Promise.resolve(); });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.listAdminPharmacyLicences.mockResolvedValueOnce({
    items: [], pagination: { hasMore: false, nextCursor: null },
  });
  await act(async () => button('Approve').click());
  finishOldPage({
    items: [row], pagination: { hasMore: false, nextCursor: null },
  });
  await oldPage;
  expect(host.textContent).not.toContain('Example Pharmacy');
  expect(host.textContent).toContain('No pending licences');
});

it('a failed full refresh hides old review candidates instead of treating them as pending', async () => {
  api.listAdminPharmacyLicences.mockRejectedValueOnce(new Error('Server unavailable'));
  await act(async () => button('Refresh').click());
  expect(host.textContent).not.toContain('Example Pharmacy');
  expect(host.querySelector('[role="alert"]').textContent).toContain('Server unavailable');
});
