// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LoyaltySettingsCard } from './LoyaltySettingsCard';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../api/client', () => ({ api: { warehouseSettings: vi.fn(), updateWarehouseLoyalty: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const loyalty = { revision: 2, mode: 'monthly', enabled: true, tiers: [{ minSyp: 100000, discountSyp: 1000 }] };
beforeEach(async () => {
  vi.clearAllMocks();
  api.warehouseSettings.mockResolvedValue({ settings: { loyalty } });
  api.updateWarehouseLoyalty.mockImplementation(async (body) => ({ settings: { loyalty: body } }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<LoyaltySettingsCard />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('preserves a saved monthly strategy and explains incremental rewards rather than a second order discount', async () => {
  expect(host.querySelector('select').value).toBe('monthly');
  expect(host.textContent).toContain('warehouseSettings.loyalty.monthlyHelp');
  expect(host.textContent).toContain('warehouseSettings.loyalty.monthlyExample');
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.updateWarehouseLoyalty).toHaveBeenCalledWith(loyalty);
});
it('switches the warehouse to the per-order method explicitly', async () => {
  await act(async () => { const select = host.querySelector('select'); select.value = 'per_order'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.updateWarehouseLoyalty).toHaveBeenCalledWith({ ...loyalty, mode: 'per_order' });
});
