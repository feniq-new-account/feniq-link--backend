// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { AdminDashboardPage } from './AdminDashboardPage';

vi.mock('react-i18next', () => {
  const t = (key) => key;
  return { useTranslation: () => ({ t }) };
});
vi.mock('../api/client', () => ({
  api: {
    pendingAccounts: vi.fn(),
    pendingOffers: vi.fn(),
    adminBanners: vi.fn(),
    adminProductsCount: vi.fn(),
    adminExchangeRate: vi.fn(),
  },
}));
vi.mock('../realtime/useRealtimeSync', () => ({
  REALTIME_EVENTS: {
    ACCOUNT_PENDING: 'account.pending',
    ACCOUNT_STATUS_UPDATED: 'account.status',
    OFFER_PENDING: 'offer.pending',
    OFFER_STATUS_UPDATED: 'offer.status',
    BANNER_PENDING: 'banner.pending',
    BANNER_STATUS_UPDATED: 'banner.status',
  },
  useRealtimeSync: () => {},
}));
vi.mock('./AdminOperationsOverview', () => ({ AdminOperationsOverview: () => null }));
vi.mock('../components/FeatureControlCenter', () => ({ FeatureControlCenter: () => null }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(() => {
  vi.clearAllMocks();
  api.pendingAccounts.mockResolvedValue({ accounts: [
    { user: { id: 'p1', name: 'Pharmacy A', role: 'pharmacist' }, pharmacy: { nameEn: 'Pharmacy A', city: 'Lattakia' } },
    { user: { id: 'p2', name: 'Pharmacy B', role: 'pharmacist' }, pharmacy: { nameEn: 'Pharmacy B' } },
  ] });
  api.pendingOffers.mockResolvedValue({ offers: [
    { id: 'o1', titleEn: 'Pack offer', warehouseNameEn: 'Warehouse A',
      offerType: 'discount', discountPercentage: 10 },
  ] });
  api.adminBanners.mockResolvedValue({ banners: [{ id: 'ad1' }] });
  api.adminProductsCount.mockResolvedValue({ count: 38 });
  api.adminExchangeRate.mockResolvedValue({ exchangeRate: { usdToSyp: 144.625 } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
});
async function render() {
  await act(async () => { root.render(<MemoryRouter><AdminDashboardPage /></MemoryRouter>); });
}
it('shows only source-backed counts in a clear admin command center with quick shortcuts', async () => {
  await render();
  expect(host.querySelector('.adm-dashboard-hero h1').textContent).toBe('nav.dashboard');
  const stats = [...host.querySelectorAll('.adm-stat-card .adm-stat-value')].map((node) => node.textContent);
  expect(stats).toEqual(['2','1','1','38']);
  expect(host.querySelector('.adm-dashboard-shortcuts a[href="/admin/commission"]')).not.toBeNull();
  expect(host.querySelector('.adm-dashboard-shortcuts a[href="/admin/features"]')).not.toBeNull();
  expect(host.textContent).toContain('Pharmacy A');
  expect(host.textContent).toContain('Pack offer');
  expect(host.querySelector('.adm-dashboard-fx')).not.toBeNull();
  expect(api.adminBanners).toHaveBeenCalledWith('pending');
});
it('fails closed on invalid counts rather than displaying false zeros', async () => {
  api.adminProductsCount.mockResolvedValueOnce({ count: null });
  await render();
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(host.querySelector('.adm-stats-grid')).toBeNull();
  expect(host.textContent).toContain('adminUx.invalidDashboardData');
});
it('clears old queue figures on refresh error and retries successfully', async () => {
  await render();
  expect(host.querySelector('.adm-stats-grid')).not.toBeNull();
  api.pendingAccounts.mockRejectedValueOnce(new Error('Network offline'));
  await act(async () => {
    host.querySelector('.adm-dashboard-refresh').click();
  });
  expect(host.querySelector('.adm-stats-grid')).toBeNull();
  expect(host.querySelector('[role=alert]').textContent).toContain('Network offline');
  await act(async () => { host.querySelector('.adm-dashboard-retry').click(); });
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(host.querySelector('.adm-stats-grid')).not.toBeNull();
});
