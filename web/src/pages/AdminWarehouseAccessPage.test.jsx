// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminWarehouseAccessPage } from './AdminWarehouseAccessPage';
import { api } from '../api/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../api/client', () => ({ api: {
  listAdminWarehouseAccess: vi.fn(), getAdminWarehouseSubscription: vi.fn(), getAdminWarehouseMembers: vi.fn(),
  updateAdminWarehouseSubscription: vi.fn(), createAdminWarehouseMember: vi.fn(), updateAdminWarehouseMemberRole: vi.fn(),
} }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const subscription = { state: 'not_started', featureNames: ['loyalty', 'repTracking'], configuration: null };
async function click(button) { await act(async () => { button.click(); }); }
function buttonWith(text) { return [...host.querySelectorAll('button')].find((button) => button.textContent.includes(text)); }

beforeEach(async () => {
  vi.clearAllMocks();
  api.listAdminWarehouseAccess.mockResolvedValue({ warehouses: [{ id: 'w1', nameAr: 'Warehouse A', city: 'Latakia' }], pagination: { hasMore: false, nextCursor: null } });
  api.getAdminWarehouseSubscription.mockResolvedValue(subscription);
  api.getAdminWarehouseMembers.mockResolvedValue({ members: [{ id: 'u1', name: 'Owner', phone: '0944000001', warehouseRole: 'legacy' }] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<AdminWarehouseAccessPage />); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe('warehouse access administration', () => {
  it('saves warehouse-specific feature switches with the configured trial instead of extending it', async () => {
    await click(buttonWith('Warehouse A'));
    const loyalty = host.querySelector('input[type="checkbox"]');
    await click(loyalty);
    api.updateAdminWarehouseSubscription.mockResolvedValue({ ...subscription, state: 'trial' });
    const form = buttonWith('warehouseAccess.save').closest('form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(api.updateAdminWarehouseSubscription).toHaveBeenCalledWith('w1', expect.objectContaining({
      status: 'trial', graceDays: 7, features: { loyalty: false, repTracking: true },
    }));
    expect(api.updateAdminWarehouseSubscription.mock.calls[0][1]).not.toHaveProperty('trialUntil');
    expect(host.textContent).toContain('warehouseAccess.saved');
  });

  it('offers a retry in place when loading subscription details fails', async () => {
    api.getAdminWarehouseSubscription.mockRejectedValueOnce(new Error('Network unavailable'));
    await click(buttonWith('Warehouse A'));
    expect(host.textContent).toContain('Network unavailable');
    await click(buttonWith('common.retry'));
    expect(api.getAdminWarehouseSubscription).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('warehouseAccess.subscription');
  });

  it('changes only the selected member role and displays the renewed sign-in requirement', async () => {
    await click(buttonWith('Warehouse A'));
    api.updateAdminWarehouseMemberRole.mockResolvedValue({ members: [{ id: 'u1', name: 'Owner', phone: '0944000001', warehouseRole: 'owner' }] });
    const select = [...host.querySelectorAll('li select')][0];
    await act(async () => { select.value = 'owner'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(api.updateAdminWarehouseMemberRole).toHaveBeenCalledWith('w1', 'u1', 'owner');
    expect(host.textContent).toContain('warehouseAccess.roleChanged');
  });
});
