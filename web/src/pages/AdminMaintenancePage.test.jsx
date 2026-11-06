// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminMaintenancePage } from './AdminMaintenancePage';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
vi.mock('../api/client', () => ({ api: {
  getAdminMaintenancePreview: vi.fn(),
  adminAccounts: vi.fn(),
  resetAccountPassword: vi.fn(),
  unblockAccount: vi.fn(),
} }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const preview = {
  readOnly: true, cleanupAvailable: false, generatedAt: new Date().toISOString(),
  needsAccountRecovery: 1, warehouses: [{
    id: 'w1', nameAr: 'مستودع النجاح', city: 'Latakia', accountStatus: 'blocked',
    counts: { products: 118, offers: 29, orders: 18, payments: 3, orderitems: 42 },
  }],
};
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
  api.getAdminMaintenancePreview.mockResolvedValue({ preview });
  api.adminAccounts.mockResolvedValue({ accounts: [{
    user: { id: 'warehouse-owner', phone: '0930000101', role: 'warehouse', status: 'blocked' },
  }] });
  api.resetAccountPassword.mockResolvedValue({ success: true });
  api.unblockAccount.mockResolvedValue({ success: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><AdminMaintenancePage /></MemoryRouter>));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});

it('shows live read-only inventory with backup links, not destructive actions', () => {
  expect(host.textContent).toContain('مستودع النجاح');
  expect(host.textContent).toContain('118');
  expect(host.querySelector('a[href*="db-backup.yml"]')).not.toBeNull();
  expect(host.querySelector('a[href*="backend/scripts/backup/README.md"]')).not.toBeNull();
  expect(host.querySelector('button')).not.toBeNull();
  expect(host.querySelector('button[aria-label="Delete everything"]')).toBeNull();
});

it('admin confirmation recovers only known blocked warehouse accounts using existing audited API', async () => {
  const button = [...host.querySelectorAll('button')].find(node => node.textContent.includes('maintenance.recoverAccounts'));
  expect(button).toBeDefined();
  await act(async () => button.click());
  expect(globalThis.confirm).toHaveBeenCalledTimes(1);
  expect(api.resetAccountPassword).toHaveBeenCalledTimes(1);
  const [id, payload] = api.resetAccountPassword.mock.calls[0];
  expect(id).toBe('warehouse-owner');
  expect(payload.password.length).toBeGreaterThanOrEqual(10);
  expect(api.unblockAccount).toHaveBeenCalledWith('warehouse-owner');
  expect(host.textContent).toContain(payload.password);
  expect(host.textContent).toContain('maintenance.activated');
});

it('never resets a similarly blocked but non-demo warehouse', async () => {
  api.adminAccounts.mockResolvedValue({ accounts: [{
    user: { id: 'other', phone: '0939000000', role: 'warehouse', status: 'blocked' },
  }] });
  const button = [...host.querySelectorAll('button')].find(node => node.textContent.includes('maintenance.recoverAccounts'));
  await act(async () => button.click());
  expect(api.resetAccountPassword).not.toHaveBeenCalled();
  expect(globalThis.confirm).not.toHaveBeenCalled();
});

it('reports pilot readiness separately from end-to-end order acceptance', async () => {
  api.getAdminMaintenancePreview.mockResolvedValueOnce({
    preview: {
      ...preview,
      pilotReadiness: {
        activePharmacies: 4, visibleWarehouses: 1, warehousesWithCatalog: 1,
        warehousesWithOffers: 1, warehousesWithPackages: 1, orderingEnabled: false,
        phoneToDashboardVerified: false,
      },
      warehouses: [{
        ...preview.warehouses[0],
        readiness: {
          visibleToPharmacist: true, availableProducts: 118, visibleOffers: 29,
          visiblePackages: 1, visibleBanners: 1,
        },
      }],
    },
  });
  const refresh = [...host.querySelectorAll('button')].find(b => b.textContent.includes('maintenance.refresh'));
  await act(async () => refresh.click());
  expect(host.textContent).toContain('maintenance.pilotReadiness');
  expect(host.textContent).toContain('maintenance.readinessNotEndToEnd');
  expect(host.textContent).toContain('maintenance.orderSwitchOff');
  expect(host.textContent).toContain('maintenance.warehouseVisible');
  expect(host.textContent).toContain('29');
});
