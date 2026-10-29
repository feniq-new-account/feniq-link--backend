// @vitest-environment jsdom
import React, { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WarehouseDebtsPage } from './WarehouseDebtsPage';
import { api } from '../api/client';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { warehouseRole: 'accountant' } }) }));
vi.mock('../context/WarehouseSubscriptionContext', () => ({ useWarehouseSubscription: () => ({ hasFeature: () => true }) }));
vi.mock('../components/WarehouseSummaryCard', () => ({ WarehouseSummaryCard: () => null }));
vi.mock('../components/WarehouseGroupSubNav', () => ({ WarehouseGroupSubNav: () => null }));
vi.mock('../api/client', () => ({ api: { warehouseBalances: vi.fn(), createPayment: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
beforeEach(async () => {
  api.warehouseBalances.mockResolvedValue({ pharmacies: [{ pharmacyId: 'p1', nameAr: 'صيدلية الشفاء', nameEn: 'Al Shifa',
    phone: '0944000001', balanceSyp: 1000, purchasesSyp: 1000, paidSyp: 0 }], pagination: { hasMore: false } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><WarehouseDebtsPage /></MemoryRouter>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('places full and partial confirmation directly inside the same pharmacy action cell', async () => {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent === 'quickPay.fullButton');
  const cell = button.closest('td');
  await act(async () => button.click());
  expect(cell.querySelector('.inline-payment')).not.toBeNull();
  expect(cell.querySelector('.wh-order-actions').nextElementSibling.className).toBe('inline-payment');
  expect(host.querySelector('.modal-overlay')).toBeNull();
  expect(host.textContent).toContain('quickPay.fullConfirm');
  const partial = [...cell.querySelectorAll('button')].find((b) => b.textContent === 'quickPay.partialButton');
  await act(async () => partial.click());
  expect(cell.querySelector('input[inputmode="numeric"]')).not.toBeNull();
  expect(document.activeElement).toBe(cell.querySelector('input'));
});
